import asyncio
import websockets
import json
import chess
import time
import uuid
import os
from dotenv import load_dotenv
import db  # Import our MongoDB module
from datetime import datetime

# Load environment variables
load_dotenv('config.env')
SERVER_HOST = os.getenv('SERVER_HOST', '0.0.0.0')
SERVER_PORT = int(os.getenv('SERVER_PORT', 8765))

# Custom JSON encoder to handle datetime objects
class DateTimeEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, datetime):
            return obj.timestamp()
        return super(DateTimeEncoder, self).default(obj)

# Helper function to convert objects to JSON with datetime handling
def json_serialize(obj):
    return json.dumps(obj, cls=DateTimeEncoder)

# Helper function to send JSON data to a websocket
async def send_json(websocket, data):
    try:
        if websocket.open:
            await websocket.send(json_serialize(data))
            return True
        else:
            print(f"WebSocket is closed, can't send message")
            return False
    except websockets.exceptions.ConnectionClosed as e:
        print(f"Connection closed while sending: {e.code}")
        return False
    except Exception as e:
        print(f"Error sending data: {e}")
        return False

# Helper function to check if a websocket is still connected
def is_socket_connected(websocket):
    return websocket.open if hasattr(websocket, 'open') else False

# Game sessions storage
active_games = {}
player_queue = []
clients = {}  # websocket -> player_id
spectators = {}  # websocket -> game_id
authenticated_users = {}  # player_id -> user_id (MongoDB)

# Timer update interval (in seconds)
TIMER_UPDATE_INTERVAL = 1.0

# Function to clean inactive connections
async def clean_inactive_connections():
    try:
        # Remove disconnected clients
        disconnected_clients = []
        for websocket, player_id in clients.items():
            if not is_socket_connected(websocket):
                disconnected_clients.append(websocket)
        
        for websocket in disconnected_clients:
            player_id = clients[websocket]
            print(f"Cleaning up disconnected client: {player_id}")
            
            # Remove from queue if they were waiting
            if player_id in player_queue:
                player_queue.remove(player_id)
            
            # If they were in a game, handle that
            if player_id in users and "game_id" in users[player_id]:
                game_id = users[player_id]["game_id"]
                if game_id in active_games:
                    game = active_games[game_id]
                    if users[player_id]["color"] == "white":
                        game.status = "black_wins_disconnect"
                    else:
                        game.status = "white_wins_disconnect"
                    
                    # Update game status in MongoDB
                    winner = game.black_player if users[player_id]["color"] == "white" else game.white_player
                    db.end_game(game.id, game.status, winner, "disconnect")
                    
                    await broadcast_game_state(game)
            
            # Clean up
            if player_id in users:
                del users[player_id]
            
            if player_id in authenticated_users:
                del authenticated_users[player_id]
            
            del clients[websocket]
        
        # Remove disconnected spectators
        disconnected_spectators = []
        for websocket, spectator_id in spectators.items():
            if not is_socket_connected(websocket):
                disconnected_spectators.append(websocket)
        
        for websocket in disconnected_spectators:
            spectator_id = spectators[websocket]
            print(f"Cleaning up disconnected spectator: {spectator_id}")
            
            # Remove spectator from games
            for game in active_games.values():
                if websocket in game.spectators:
                    game.spectators.remove(websocket)
            
            del spectators[websocket]
    except Exception as e:
        print(f"Error cleaning inactive connections: {e}")

# Periodic task for connection cleanup
async def connection_cleanup_task():
    while True:
        try:
            await clean_inactive_connections()
            await asyncio.sleep(5)  # Run every 5 seconds
        except Exception as e:
            print(f"Error in connection cleanup task: {e}")
            await asyncio.sleep(5)

class ChessGame:
    def __init__(self, white_player, black_player):
        self.id = str(uuid.uuid4())
        self.white_player = white_player
        self.black_player = black_player
        self.board = chess.Board()
        self.current_turn = 'white'
        self.spectators = set()
        self.chat_history = []
        self.move_history = []
        # Time control - 10 minutes per player
        self.white_time = 600
        self.black_time = 600
        self.last_move_time = time.time()
        self.status = "ongoing"
        
        # Create game record in MongoDB
        db.create_game_record(self.id, white_player, black_player)
    
    def get_state(self):
        return {
            'board': self.board.fen(),
            'turn': self.current_turn,
            'white_time': self.white_time,
            'black_time': self.black_time,
            'white_player': self.white_player,
            'black_player': self.black_player,
            'status': self.status,
            'move_history': self.move_history,
            'is_check': self.board.is_check(),
            'is_checkmate': self.board.is_checkmate(),
            'is_stalemate': self.board.is_stalemate()
        }
    
    def make_move(self, move_uci):
        try:
            move = chess.Move.from_uci(move_uci)
            if move in self.board.legal_moves:
                self.board.push(move)
                self.move_history.append(move_uci)
                
                # The timer update task will handle time updates
                # Just reset the last_move_time and switch turns
                if self.current_turn == 'white':
                    self.current_turn = 'black'
                else:
                    self.current_turn = 'white'
                
                # Reset the last move time to now
                self.last_move_time = time.time()
                
                # Save move to MongoDB
                db.update_game_move(self.id, move_uci)
                
                # Check for game ending conditions
                if self.board.is_checkmate():
                    self.status = "white_wins" if self.current_turn == 'black' else "black_wins"
                elif self.board.is_stalemate() or self.board.is_insufficient_material():
                    self.status = "draw"
                
                # Update game status in MongoDB if the game ended
                if self.status != "ongoing":
                    winner = None
                    win_reason = None
                    
                    if self.status == "white_wins" or self.status == "white_wins_time" or self.status == "white_wins_disconnect":
                        winner = self.white_player
                        win_reason = self.status.replace("white_wins_", "") if "_" in self.status else "checkmate"
                    elif self.status == "black_wins" or self.status == "black_wins_time" or self.status == "black_wins_disconnect":
                        winner = self.black_player
                        win_reason = self.status.replace("black_wins_", "") if "_" in self.status else "checkmate"
                    
                    db.end_game(self.id, self.status, winner, win_reason)
                
                return True, "Move successful"
            else:
                return False, "Illegal move"
        except Exception as e:
            return False, str(e)

# User authentication - MongoDB version
async def register_user(websocket, data):
    username = data.get("username", "")
    password = data.get("password", "")
    
    if not username or not password:
        await send_json(websocket, {
            "type": "auth_response", 
            "success": False, 
            "message": "Username and password are required"
        })
        return False
    
    success, message, user_id = db.register_user_db(username, password)
    
    if success:
        player_id = str(uuid.uuid4())
        users[player_id] = {"username": username, "websocket": websocket}
        clients[websocket] = player_id
        authenticated_users[player_id] = user_id
        
        await send_json(websocket, {
            "type": "auth_response", 
            "success": True, 
            "player_id": player_id,
            "message": message
        })
        return True
    else:
        await send_json(websocket, {
            "type": "auth_response", 
            "success": False, 
            "message": message
        })
        return False

async def login_user(websocket, data):
    username = data.get("username", "")
    password = data.get("password", "")
    
    if not username or not password:
        await send_json(websocket, {
            "type": "auth_response", 
            "success": False, 
            "message": "Username and password are required"
        })
        return False
    
    success, message, user_id = db.authenticate_user(username, password)
    
    if success:
        player_id = str(uuid.uuid4())
        users[player_id] = {"username": username, "websocket": websocket}
        clients[websocket] = player_id
        authenticated_users[player_id] = user_id
        
        # Get user profile
        user_profile = db.get_user_profile(user_id)
        
        await send_json(websocket, {
            "type": "auth_response", 
            "success": True, 
            "player_id": player_id,
            "user_profile": user_profile,
            "message": message
        })
        return True
    else:
        await send_json(websocket, {
            "type": "auth_response", 
            "success": False, 
            "message": message
        })
        return False

# Simple username registration (fallback)
users = {}

async def simple_register_user(websocket, username):
    if username in [user["username"] for user in users.values()]:
        await send_json(websocket, {"type": "auth_response", "success": False, "message": "Username already taken"})
        return False
    
    player_id = str(uuid.uuid4())
    users[player_id] = {"username": username, "websocket": websocket}
    clients[websocket] = player_id
    
    await send_json(websocket, {"type": "auth_response", "success": True, "player_id": player_id})
    return True

async def find_match(websocket, player_id):
    username = users[player_id]["username"]
    
    # Add to matchmaking queue
    player_queue.append(player_id)
    await send_json(websocket, {"type": "lobby_status", "status": "waiting", "queue_position": len(player_queue)})
    
    # If we have at least 2 players, create a game
    if len(player_queue) >= 2:
        white_id = player_queue.pop(0)
        black_id = player_queue.pop(0)
        
        # Ensure both players are still connected
        if white_id not in users or black_id not in users:
            # Put the still-connected player back in queue
            if white_id in users:
                player_queue.append(white_id)
            if black_id in users:
                player_queue.append(black_id)
            return False
        
        white_socket = users[white_id]["websocket"]
        black_socket = users[black_id]["websocket"]
        
        game = ChessGame(users[white_id]["username"], users[black_id]["username"])
        active_games[game.id] = game
        
        # Associate players with this game
        users[white_id]["game_id"] = game.id
        users[white_id]["color"] = "white"
        users[black_id]["game_id"] = game.id
        users[black_id]["color"] = "black"
        
        # Notify players that game is starting
        white_success = await send_json(white_socket, {
            "type": "game_start",
            "game_id": game.id,
            "color": "white",
            "opponent": users[black_id]["username"],
            "state": game.get_state()
        })
        
        black_success = await send_json(black_socket, {
            "type": "game_start",
            "game_id": game.id,
            "color": "black",
            "opponent": users[white_id]["username"],
            "state": game.get_state()
        })
        
        # If one of the clients failed to receive the start message, clean up
        if not white_success or not black_success:
            print(f"Failed to start game: white={white_success}, black={black_success}")
            # Remove this game
            if game.id in active_games:
                del active_games[game.id]
            
            # Remove game references from users
            if white_id in users:
                users[white_id].pop("game_id", None)
                users[white_id].pop("color", None)
                player_queue.append(white_id)  # Put player back in queue
            
            if black_id in users:
                users[black_id].pop("game_id", None)
                users[black_id].pop("color", None)
                player_queue.append(black_id)  # Put player back in queue
            
            return False
        
        return True
    
    return False

async def handle_move(websocket, player_id, data):
    if player_id not in users or "game_id" not in users[player_id]:
        await send_json(websocket, {"type": "error", "message": "Not in a game"})
        return
    
    game_id = users[player_id]["game_id"]
    game = active_games[game_id]
    player_color = users[player_id]["color"]
    
    # Check if it's this player's turn
    if (player_color == "white" and game.current_turn != "white") or (player_color == "black" and game.current_turn != "black"):
        await send_json(websocket, {"type": "error", "message": "Not your turn"})
        return
    
    # Make the move
    success, message = game.make_move(data["move"])
    
    if success:
        # Update all clients
        await broadcast_game_state(game)
    else:
        await send_json(websocket, {"type": "error", "message": message})

async def handle_chat(websocket, player_id, data):
    if player_id not in users or "game_id" not in users[player_id]:
        await send_json(websocket, {"type": "error", "message": "Not in a game"})
        return
    
    game_id = users[player_id]["game_id"]
    game = active_games[game_id]
    username = users[player_id]["username"]
    message_text = data["message"]
    
    # Add to chat history
    chat_message = {
        "sender": username,
        "message": message_text,
        "timestamp": time.time()
    }
    game.chat_history.append(chat_message)
    
    # Save to MongoDB
    db.save_chat_message(game_id, username, message_text)
    
    # Broadcast to all players and spectators in game
    message_data = {
        "type": "chat",
        "message": chat_message
    }
    
    # Find players for this game
    white_player_ids = [pid for pid, user in users.items() if user.get("game_id") == game_id and user.get("color") == "white"]
    black_player_ids = [pid for pid, user in users.items() if user.get("game_id") == game_id and user.get("color") == "black"]
    
    # Send to white player if connected
    if white_player_ids:
        try:
            white_socket = users[white_player_ids[0]]["websocket"]
            await send_json(white_socket, message_data)
        except Exception as e:
            print(f"Error sending chat to white player: {e}")
    
    # Send to black player if connected  
    if black_player_ids:
        try:
            black_socket = users[black_player_ids[0]]["websocket"]
            await send_json(black_socket, message_data)
        except Exception as e:
            print(f"Error sending chat to black player: {e}")
    
    # Send to spectators
    for spectator_socket in list(game.spectators):
        try:
            if spectator_socket.open:
                await send_json(spectator_socket, message_data)
            else:
                game.spectators.remove(spectator_socket)
        except Exception as e:
            print(f"Error sending chat to spectator: {e}")
            if spectator_socket in game.spectators:
                game.spectators.remove(spectator_socket)

async def spectate_game(websocket, data):
    game_id = data["game_id"]
    
    if game_id not in active_games:
        await send_json(websocket, {"type": "error", "message": "Game not found"})
        return
    
    game = active_games[game_id]
    spectator_id = str(uuid.uuid4())
    spectators[websocket] = spectator_id
    game.spectators.add(websocket)
    
    # Get player_id if authenticated
    player_id = clients.get(websocket)
    username = users.get(player_id, {}).get("username", "Anonymous")
    
    # Log spectator action
    db.log_spectator_action(game_id, spectator_id, username, "join")
    
    # Retrieve chat history from MongoDB
    chat_history = db.get_chat_history(game_id)
    # Convert to format expected by client
    chat_messages = [
        {
            "sender": msg["sender"],
            "message": msg["message"],
            "timestamp": msg["timestamp"].timestamp() if hasattr(msg["timestamp"], "timestamp") else msg["timestamp"]
        }
        for msg in chat_history
    ]
    
    # Send current game state
    await send_json(websocket, {
        "type": "spectate_game",
        "game_id": game_id,
        "state": game.get_state(),
        "chat_history": chat_messages
    })

async def broadcast_game_state(game):
    # Prepare update message
    state = game.get_state()
    update_message = {
        "type": "game_update",
        "state": state
    }
    
    # Find white and black player IDs
    white_player_ids = [pid for pid, user in users.items() if user.get("game_id") == game.id and user.get("color") == "white"]
    black_player_ids = [pid for pid, user in users.items() if user.get("game_id") == game.id and user.get("color") == "black"]
    
    # Track if any player is disconnected - if so, don't update time
    if not white_player_ids or not black_player_ids:
        # Auto-end game if a player is disconnected for too long
        time_since_move = time.time() - game.last_move_time
        if time_since_move > 30 and game.status == "ongoing":  # 30 second timeout
            if not white_player_ids:
                game.status = "black_wins_disconnect"
                db.end_game(game.id, game.status, game.black_player, "disconnect")
            elif not black_player_ids:
                game.status = "white_wins_disconnect"
                db.end_game(game.id, game.status, game.white_player, "disconnect")
    
    # Send to white player if still connected
    if white_player_ids:
        white_player_id = white_player_ids[0]
        try:
            white_socket = users[white_player_id]["websocket"]
            await send_json(white_socket, update_message)
        except websockets.exceptions.ConnectionClosed:
            # Handle connection closed gracefully
            print(f"White player disconnected: {game.white_player}")
        except Exception as e:
            print(f"Error sending to white player: {e}")
    
    # Send to black player if still connected
    if black_player_ids:
        black_player_id = black_player_ids[0]
        try:
            black_socket = users[black_player_id]["websocket"]
            await send_json(black_socket, update_message)
        except websockets.exceptions.ConnectionClosed:
            # Handle connection closed gracefully
            print(f"Black player disconnected: {game.black_player}")
        except Exception as e:
            print(f"Error sending to black player: {e}")
    
    # Send to spectators
    disconnected_spectators = []
    for spectator_socket in game.spectators:
        try:
            await send_json(spectator_socket, update_message)
        except websockets.exceptions.ConnectionClosed:
            # Connection closed cleanly
            disconnected_spectators.append(spectator_socket)
        except Exception as e:
            print(f"Error sending to spectator: {e}")
            disconnected_spectators.append(spectator_socket)
    
    # Clean up disconnected spectators
    for socket in disconnected_spectators:
        spectator_id = spectators.get(socket)
        if spectator_id and socket in game.spectators:
            game.spectators.remove(socket)
            print(f"Spectator {spectator_id} removed from game {game.id}")
            # We don't need to log to MongoDB here as it may cause additional errors

async def list_games(websocket):
    games_list = []
    
    for game_id, game in active_games.items():
        if game.status == "ongoing":  # Only show ongoing games
            games_list.append({
                "game_id": game_id,
                "white_player": game.white_player,
                "black_player": game.black_player,
                "move_count": len(game.move_history),
                "spectator_count": len(game.spectators)
            })
    
    await send_json(websocket, {
        "type": "games_list",
        "games": games_list
    })

async def get_user_games(websocket, player_id):
    if player_id not in users:
        await send_json(websocket, {"type": "error", "message": "User not found"})
        return
    
    username = users[player_id]["username"]
    games = db.get_user_games(username)
    
    # Convert MongoDB objects to JSON serializable format
    sanitized_games = []
    for game in games:
        game_copy = dict(game)
        game_copy.pop('_id', None)
        
        # Convert datetime objects to timestamps - these are now handled by DateTimeEncoder
        
        sanitized_games.append(game_copy)
    
    await send_json(websocket, {
        "type": "user_games",
        "games": sanitized_games
    })

async def get_user_stats(websocket, player_id):
    if player_id not in users:
        await send_json(websocket, {"type": "error", "message": "User not found"})
        return
    
    if player_id in authenticated_users:
        user_id = authenticated_users[player_id]
        user_profile = db.get_user_profile(user_id)
        
        await send_json(websocket, {
            "type": "user_stats",
            "stats": {
                "username": user_profile["username"],
                "games_played": user_profile["games_played"],
                "wins": user_profile["wins"],
                "losses": user_profile["losses"],
                "draws": user_profile["draws"],
                "join_date": user_profile["created_at"]
            }
        })
    else:
        await send_json(websocket, {
            "type": "error",
            "message": "User is not fully authenticated with an account"
        })

# Periodic task for timer updates
async def timer_update_task():
    while True:
        try:
            # Update all active games
            for game_id, game in list(active_games.items()):
                if game.status == "ongoing":
                    # Update the active player's timer
                    current_time = time.time()
                    elapsed = current_time - game.last_move_time
                    
                    if game.current_turn == 'white':
                        game.white_time = max(0, game.white_time - elapsed)
                        if game.white_time <= 0:
                            game.white_time = 0
                            game.status = "black_wins_time"
                            # Update game status in MongoDB
                            db.end_game(game.id, game.status, game.black_player, "time")
                    else:
                        game.black_time = max(0, game.black_time - elapsed)
                        if game.black_time <= 0:
                            game.black_time = 0
                            game.status = "white_wins_time"
                            # Update game status in MongoDB
                            db.end_game(game.id, game.status, game.white_player, "time")
                    
                    # Update the last move time to now
                    game.last_move_time = current_time
                    
                    # Broadcast updated game state - but only occasionally to avoid overwhelming clients
                    # Send updates every 1 second
                    await broadcast_game_state(game)
            
            # Wait for next update interval
            await asyncio.sleep(TIMER_UPDATE_INTERVAL)
        except Exception as e:
            print(f"Error in timer update task: {e}")
            await asyncio.sleep(TIMER_UPDATE_INTERVAL)

async def handler(websocket, path):
    try:
        async for message in websocket:
            try:
                data = json.loads(message)
                
                if data["type"] == "register":
                    if "password" in data:
                        # Full registration with MongoDB
                        await register_user(websocket, data)
                    else:
                        # Simple registration (backward compatibility)
                        await simple_register_user(websocket, data["username"])
                
                elif data["type"] == "login":
                    await login_user(websocket, data)
                    
                elif data["type"] == "find_match":
                    if websocket in clients:
                        await find_match(websocket, clients[websocket])
                        
                elif data["type"] == "make_move":
                    if websocket in clients:
                        await handle_move(websocket, clients[websocket], data)
                        
                elif data["type"] == "chat":
                    if websocket in clients:
                        await handle_chat(websocket, clients[websocket], data)
                        
                elif data["type"] == "spectate":
                    await spectate_game(websocket, data)
                    
                elif data["type"] == "list_games":
                    await list_games(websocket)
                    
                elif data["type"] == "get_user_games":
                    if websocket in clients:
                        await get_user_games(websocket, clients[websocket])
                
                elif data["type"] == "get_user_stats":
                    if websocket in clients:
                        await get_user_stats(websocket, clients[websocket])
            except json.JSONDecodeError:
                print(f"Invalid JSON received: {message}")
                await send_json(websocket, {"type": "error", "message": "Invalid JSON format"})
            except KeyError as e:
                print(f"Missing key in message: {e}")
                await send_json(websocket, {"type": "error", "message": f"Missing required field: {e}"})
            except Exception as e:
                print(f"Error processing message: {e}")
                try:
                    await send_json(websocket, {"type": "error", "message": "Server error processing request"})
                except:
                    # Failed to send error message, connection likely closed
                    pass
    except websockets.exceptions.ConnectionClosed as e:
        # Connection closed normally
        if e.code == 1000 or e.code == 1001:
            print(f"Connection closed normally: {e.code}")
        else:
            print(f"Connection closed with code: {e.code}, reason: {e.reason}")
    except Exception as e:
        print(f"Unhandled error: {e}")
    finally:
        # Cleanup when a client disconnects
        if websocket in clients:
            player_id = clients[websocket]
            if player_id in player_queue:
                player_queue.remove(player_id)
            
            if player_id in users:
                if "game_id" in users[player_id]:
                    game_id = users[player_id]["game_id"]
                    if game_id in active_games:
                        # Handle player disconnect in active game
                        game = active_games[game_id]
                        if users[player_id]["color"] == "white":
                            game.status = "black_wins_disconnect"
                        else:
                            game.status = "white_wins_disconnect"
                        
                        # Update game status in MongoDB
                        winner = game.black_player if users[player_id]["color"] == "white" else game.white_player
                        db.end_game(game.id, game.status, winner, "disconnect")
                        
                        await broadcast_game_state(game)
                
                del users[player_id]
            
            # Remove from authenticated users
            if player_id in authenticated_users:
                del authenticated_users[player_id]
            
            del clients[websocket]
        
        elif websocket in spectators:
            spectator_id = spectators[websocket]
            
            # Log spectator leaving
            for game in active_games.values():
                if websocket in game.spectators:
                    player_id = clients.get(websocket)
                    username = users.get(player_id, {}).get("username", "Anonymous")
                    db.log_spectator_action(game.id, spectator_id, username, "leave")
                    game.spectators.remove(websocket)
            
            del spectators[websocket]

# Start the server
start_server = websockets.serve(handler, SERVER_HOST, SERVER_PORT)

if __name__ == "__main__":
    print(f"Chess server starting on {SERVER_HOST}:{SERVER_PORT}...")
    loop = asyncio.get_event_loop()
    # Start the timer update task
    loop.create_task(timer_update_task())
    # Start the connection cleanup task
    loop.create_task(connection_cleanup_task())
    loop.run_until_complete(start_server)
    loop.run_forever() 
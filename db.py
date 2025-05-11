import os
import pymongo
import bcrypt
from dotenv import load_dotenv
from datetime import datetime
import time
import sys
from bson.objectid import ObjectId

# Load environment variables
load_dotenv()

# MongoDB connection
MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017/")
DB_NAME = os.getenv("DB_NAME", "chess_game")

# Initialize MongoDB client with timeout and error handling
MAX_RETRIES = 3
RETRY_DELAY = 2

def get_database_connection():
    """Try to connect to MongoDB with retries"""
    retries = 0
    while retries < MAX_RETRIES:
        try:
            client = pymongo.MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
            # Verify connection
            client.server_info()
            return client
        except pymongo.errors.ServerSelectionTimeoutError:
            print(f"Connection to MongoDB failed (attempt {retries+1}/{MAX_RETRIES})")
            print(f"Make sure MongoDB is running at {MONGO_URI}")
            retries += 1
            if retries < MAX_RETRIES:
                print(f"Retrying in {RETRY_DELAY} seconds...")
                time.sleep(RETRY_DELAY)
    
    print("Failed to connect to MongoDB after multiple attempts")
    print("The server will run with limited functionality (no persistent storage)")
    return None

client = get_database_connection()

# Flag to track if MongoDB is available
mongodb_available = client is not None

if mongodb_available:
    try:
        db = client[DB_NAME]
        # Collections
        users_collection = db["users"]
        games_collection = db["games"]
        chat_messages_collection = db["chat_messages"]
        spectator_logs_collection = db["spectator_logs"]

        # Create indexes
        users_collection.create_index("username", unique=True)
        games_collection.create_index("game_id", unique=True)
        chat_messages_collection.create_index("game_id")
        spectator_logs_collection.create_index("game_id")
        
        print(f"Successfully connected to MongoDB database: {DB_NAME}")
    except Exception as e:
        print(f"Error setting up MongoDB: {e}")
        mongodb_available = False
        client = None

# Fallback in-memory storage when MongoDB is not available
memory_users = {}
memory_games = {}
memory_chat_messages = {}
memory_spectator_logs = {}

# User Authentication
def register_user_db(username, password):
    """
    Register a new user with hashed password
    Returns: (success, message, user_id)
    """
    if not mongodb_available:
        # In-memory fallback
        if username in memory_users:
            return False, "Username already taken", None
        
        # Hash password
        salt = bcrypt.gensalt()
        hashed_password = bcrypt.hashpw(password.encode('utf-8'), salt)
        
        user_id = str(len(memory_users) + 1)
        memory_users[username] = {
            "id": user_id,
            "username": username,
            "password": hashed_password,
            "created_at": datetime.utcnow(),
            "last_login": datetime.utcnow(),
            "games_played": 0,
            "wins": 0,
            "losses": 0,
            "draws": 0
        }
        return True, "User registered successfully (in-memory mode)", user_id
    
    # MongoDB implementation
    try:
        # Check if username exists
        if users_collection.find_one({"username": username}):
            return False, "Username already taken", None
        
        # Hash password
        salt = bcrypt.gensalt()
        hashed_password = bcrypt.hashpw(password.encode('utf-8'), salt)
        
        # Create user document
        user = {
            "username": username,
            "password": hashed_password,
            "created_at": datetime.utcnow(),
            "last_login": datetime.utcnow(),
            "games_played": 0,
            "wins": 0,
            "losses": 0,
            "draws": 0
        }
        
        result = users_collection.insert_one(user)
        return True, "User registered successfully", str(result.inserted_id)
    except Exception as e:
        print(f"Error registering user: {e}")
        return False, "Database error, please try again later", None

def authenticate_user(username, password):
    """
    Authenticate a user
    Returns: (success, message, user_id)
    """
    if not mongodb_available:
        # In-memory fallback
        if username not in memory_users:
            return False, "User not found", None
        
        user = memory_users[username]
        if bcrypt.checkpw(password.encode('utf-8'), user['password']):
            user["last_login"] = datetime.utcnow()
            return True, "Authentication successful", user["id"]
        
        return False, "Invalid password", None
    
    # MongoDB implementation
    try:
        user = users_collection.find_one({"username": username})
        if not user:
            return False, "User not found", None
        
        if bcrypt.checkpw(password.encode('utf-8'), user['password']):
            # Update last login
            users_collection.update_one(
                {"_id": user["_id"]},
                {"$set": {"last_login": datetime.utcnow()}}
            )
            return True, "Authentication successful", str(user["_id"])
        
        return False, "Invalid password", None
    except Exception as e:
        print(f"Error authenticating user: {e}")
        return False, "Database error, please try again later", None

def get_user_profile(user_id):
    """Get user profile information"""
    if not mongodb_available:
        # In-memory fallback
        for username, user in memory_users.items():
            if user["id"] == user_id:
                user_copy = user.copy()
                user_copy.pop("password", None)
                return user_copy
        return None
    
    # MongoDB implementation
    try:
        user = users_collection.find_one({"_id": ObjectId(user_id)})
        if user:
            # Remove sensitive data
            user.pop("password", None)
            user["_id"] = str(user["_id"])
            return user
        return None
    except Exception as e:
        print(f"Error getting user profile: {e}")
        return None

def update_user_stats(username, game_result):
    """Update user statistics after a game"""
    if not mongodb_available:
        # In-memory fallback
        if username in memory_users:
            memory_users[username]["games_played"] += 1
            
            if game_result == "win":
                memory_users[username]["wins"] += 1
            elif game_result == "loss":
                memory_users[username]["losses"] += 1
            elif game_result == "draw":
                memory_users[username]["draws"] += 1
        return
    
    # MongoDB implementation
    try:
        update_data = {
            "$inc": {"games_played": 1}
        }
        
        if game_result == "win":
            update_data["$inc"]["wins"] = 1
        elif game_result == "loss":
            update_data["$inc"]["losses"] = 1
        elif game_result == "draw":
            update_data["$inc"]["draws"] = 1
        
        users_collection.update_one(
            {"username": username},
            update_data
        )
    except Exception as e:
        print(f"Error updating user stats: {e}")

# Game Management
def create_game_record(game_id, white_player, black_player):
    """Create a new game record in the database"""
    game = {
        "game_id": game_id,
        "white_player": white_player,
        "black_player": black_player,
        "status": "ongoing",
        "moves": [],
        "start_time": datetime.utcnow(),
        "end_time": None,
        "winner": None,
        "win_reason": None
    }
    
    if not mongodb_available:
        # In-memory fallback
        memory_games[game_id] = game
    else:
        try:
            games_collection.insert_one(game)
        except Exception as e:
            print(f"Error creating game record: {e}")
    
    return game

def update_game_move(game_id, move_data):
    """Add a move to the game history"""
    move_entry = {
        "move": move_data,
        "timestamp": datetime.utcnow()
    }
    
    if not mongodb_available:
        # In-memory fallback
        if game_id in memory_games:
            if "moves" not in memory_games[game_id]:
                memory_games[game_id]["moves"] = []
            memory_games[game_id]["moves"].append(move_entry)
        return
    
    # MongoDB implementation
    try:
        games_collection.update_one(
            {"game_id": game_id},
            {"$push": {"moves": move_entry}}
        )
    except Exception as e:
        print(f"Error updating game move: {e}")

def end_game(game_id, status, winner=None, win_reason=None):
    """Mark a game as complete with results"""
    if not mongodb_available:
        # In-memory fallback
        if game_id in memory_games:
            memory_games[game_id]["status"] = status
            memory_games[game_id]["end_time"] = datetime.utcnow()
            memory_games[game_id]["winner"] = winner
            memory_games[game_id]["win_reason"] = win_reason
            
            # Update player statistics
            game = memory_games[game_id]
            if winner:
                if winner == game["white_player"]:
                    update_user_stats(game["white_player"], "win")
                    update_user_stats(game["black_player"], "loss")
                elif winner == game["black_player"]:
                    update_user_stats(game["black_player"], "win")
                    update_user_stats(game["white_player"], "loss")
            elif status == "draw":
                update_user_stats(game["white_player"], "draw")
                update_user_stats(game["black_player"], "draw")
        return
    
    # MongoDB implementation
    try:
        games_collection.update_one(
            {"game_id": game_id},
            {
                "$set": {
                    "status": status,
                    "end_time": datetime.utcnow(),
                    "winner": winner,
                    "win_reason": win_reason
                }
            }
        )
        
        # Update player statistics
        game = games_collection.find_one({"game_id": game_id})
        if game and winner:
            if winner == game["white_player"]:
                update_user_stats(game["white_player"], "win")
                update_user_stats(game["black_player"], "loss")
            elif winner == game["black_player"]:
                update_user_stats(game["black_player"], "win")
                update_user_stats(game["white_player"], "loss")
        elif game and status == "draw":
            update_user_stats(game["white_player"], "draw")
            update_user_stats(game["black_player"], "draw")
    except Exception as e:
        print(f"Error ending game: {e}")

def get_game_history(game_id):
    """Get full game history"""
    if not mongodb_available:
        # In-memory fallback
        return memory_games.get(game_id, None)
    
    # MongoDB implementation
    try:
        return games_collection.find_one({"game_id": game_id})
    except Exception as e:
        print(f"Error getting game history: {e}")
        return None

def get_user_games(username, limit=10):
    """Get games played by a specific user"""
    if not mongodb_available:
        # In-memory fallback
        user_games = []
        for game_id, game in memory_games.items():
            if game["white_player"] == username or game["black_player"] == username:
                user_games.append(game)
        # Sort by start_time (newest first)
        user_games.sort(key=lambda g: g.get("start_time", datetime.min), reverse=True)
        return user_games[:limit]
    
    # MongoDB implementation
    try:
        return list(games_collection.find(
            {"$or": [
                {"white_player": username},
                {"black_player": username}
            ]}
        ).sort("start_time", -1).limit(limit))
    except Exception as e:
        print(f"Error getting user games: {e}")
        return []

# Chat System
def save_chat_message(game_id, sender, message):
    """Save a chat message to the database"""
    chat_entry = {
        "game_id": game_id,
        "sender": sender,
        "message": message,
        "timestamp": datetime.utcnow(),
        "is_spectator": sender.startswith("Spectator:")
    }
    
    if not mongodb_available:
        # In-memory fallback
        if game_id not in memory_chat_messages:
            memory_chat_messages[game_id] = []
        memory_chat_messages[game_id].append(chat_entry)
        return
    
    # MongoDB implementation
    try:
        chat_messages_collection.insert_one(chat_entry)
    except Exception as e:
        print(f"Error saving chat message: {e}")

def get_chat_history(game_id):
    """Retrieve chat history for a game"""
    if not mongodb_available:
        # In-memory fallback
        return memory_chat_messages.get(game_id, [])
    
    # MongoDB implementation
    try:
        return list(chat_messages_collection.find(
            {"game_id": game_id}
        ).sort("timestamp", 1))
    except Exception as e:
        print(f"Error getting chat history: {e}")
        return []

# Spectator System
def log_spectator_action(game_id, spectator_id, username, action):
    """Log spectator activities"""
    log_entry = {
        "game_id": game_id,
        "spectator_id": spectator_id,
        "username": username,
        "action": action,
        "timestamp": datetime.utcnow()
    }
    
    if not mongodb_available:
        # In-memory fallback
        if game_id not in memory_spectator_logs:
            memory_spectator_logs[game_id] = []
        memory_spectator_logs[game_id].append(log_entry)
        return
    
    # MongoDB implementation
    try:
        spectator_logs_collection.insert_one(log_entry)
    except Exception as e:
        print(f"Error logging spectator action: {e}")

def get_active_spectators(game_id):
    """Get list of active spectators for a game"""
    if not mongodb_available:
        # In-memory fallback
        spectators = []
        for log in memory_spectator_logs.get(game_id, []):
            if log["action"] == "join":
                # Check if there's a leave action after this join
                has_left = False
                for other_log in memory_spectator_logs.get(game_id, []):
                    if (other_log["spectator_id"] == log["spectator_id"] and 
                        other_log["action"] == "leave" and 
                        other_log["timestamp"] > log["timestamp"]):
                        has_left = True
                        break
                if not has_left:
                    spectators.append({
                        "username": log["username"],
                        "joined_at": log["timestamp"]
                    })
        return spectators
    
    # MongoDB implementation
    try:
        # Get all join logs
        joins = list(spectator_logs_collection.find({
            "game_id": game_id,
            "action": "join"
        }))
        
        active_spectators = []
        for join in joins:
            # Check if there's a leave log after this join
            leave = spectator_logs_collection.find_one({
                "game_id": game_id,
                "spectator_id": join["spectator_id"],
                "action": "leave",
                "timestamp": {"$gt": join["timestamp"]}
            })
            
            if not leave:
                active_spectators.append({
                    "username": join["username"],
                    "joined_at": join["timestamp"]
                })
        
        return active_spectators
    except Exception as e:
        print(f"Error getting active spectators: {e}")
        return []

# Database Statistics
def get_system_stats():
    """Get system statistics"""
    if not mongodb_available:
        # In-memory fallback
        return {
            "total_users": len(memory_users),
            "total_games": len(memory_games),
            "completed_games": sum(1 for game in memory_games.values() if game.get("status") != "ongoing"),
            "total_moves": sum(len(game.get("moves", [])) for game in memory_games.values()),
            "total_chat_messages": sum(len(messages) for messages in memory_chat_messages.values()),
            "database_status": "In-memory (MongoDB not available)"
        }
    
    # MongoDB implementation
    try:
        return {
            "total_users": users_collection.count_documents({}),
            "total_games": games_collection.count_documents({}),
            "completed_games": games_collection.count_documents({"status": {"$ne": "ongoing"}}),
            "total_moves": sum(len(game.get("moves", [])) 
                              for game in games_collection.find({}, {"moves": 1})),
            "total_chat_messages": chat_messages_collection.count_documents({}),
            "database_status": "MongoDB connected"
        }
    except Exception as e:
        print(f"Error getting system stats: {e}")
        return {
            "database_status": f"Error: {str(e)}"
        } 
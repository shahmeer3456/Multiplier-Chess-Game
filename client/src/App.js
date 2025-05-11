import React, { useState, useEffect } from 'react';
import 'bootstrap/dist/css/bootstrap.min.css';
import { Container, Row, Col, Button, Alert, Nav, NavDropdown } from 'react-bootstrap';
import Login from './components/Login';
import Lobby from './components/Lobby';
import Game from './components/Game';
import SpectateGame from './components/SpectateGame';
import UserProfile from './components/UserProfile';
import GameHistory from './components/GameHistory';
import './App.css';

function App() {
  const [currentScreen, setCurrentScreen] = useState('login');
  const [socket, setSocket] = useState(null);
  const [user, setUser] = useState({
    username: '',
    playerId: null,
    isAuthenticated: false,
    isRegistered: false,
    profile: null
  });
  const [gameData, setGameData] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);
  const [spectateGameId, setSpectateGameId] = useState(null);
  const [gameHistory, setGameHistory] = useState([]);

  // Connect to WebSocket server
  useEffect(() => {
    let reconnectTimer;
    let reconnectAttempts = 0;
    const MAX_RECONNECT_ATTEMPTS = 5;
    const RECONNECT_DELAY = 3000; // 3 seconds
    const WS_URL = 'ws://localhost:8765';

    const connectWebSocket = () => {
      console.log(`Attempting to connect to WebSocket server at ${WS_URL}...`);
      const newSocket = new WebSocket(WS_URL);
      
      newSocket.onopen = () => {
        console.log('Connected to WebSocket server');
        setErrorMessage(null);
        reconnectAttempts = 0; // Reset reconnect attempts on successful connection
        
        // If user was already logged in and lost connection, attempt to re-authenticate
        if (user.isAuthenticated && user.username) {
          console.log('Attempting to re-authenticate after reconnection...');
          // We use a simple re-registration since we don't store passwords
          setTimeout(() => {
            newSocket.send(JSON.stringify({
              type: 'register',
              username: user.username
            }));
          }, 500); // Short delay to ensure connection is fully established
        }
      };
      
      newSocket.onclose = (event) => {
        console.log(`WebSocket closed with code: ${event.code}, reason: ${event.reason}`);
        
        if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
          setErrorMessage(`Disconnected from WebSocket server. Attempting to reconnect... (${reconnectAttempts + 1}/${MAX_RECONNECT_ATTEMPTS})`);
          
          // Try to reconnect after delay
          reconnectTimer = setTimeout(() => {
            reconnectAttempts++;
            connectWebSocket();
          }, RECONNECT_DELAY);
        } else {
          setErrorMessage('Connection to game server lost. Please refresh the page to try again.');
        }
      };
      
      newSocket.onerror = (error) => {
        console.error('WebSocket error:', error);
        setErrorMessage('Connection error. Please check if the server is running and refresh the page.');
      };
      
      newSocket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        console.log('Received message:', data);
        
        if (data.type === 'auth_response') {
          if (data.success) {
            const userUpdate = {
              ...user,
              playerId: data.player_id,
              isAuthenticated: true,
              isRegistered: !!data.user_profile // If user_profile exists, this is a registered user
            };
            
            if (data.user_profile) {
              userUpdate.profile = data.user_profile;
            }
            
            setUser(userUpdate);
            setCurrentScreen('lobby');
          } else {
            setErrorMessage(data.message);
          }
        }
        
        else if (data.type === 'game_start') {
          setGameData({
            gameId: data.game_id,
            color: data.color,
            opponent: data.opponent,
            state: data.state
          });
          setCurrentScreen('game');
        }
        
        else if (data.type === 'game_update') {
          if (gameData) {
            // Get the updated turn information
            const newTurn = data.state.turn;
            const myColor = gameData.color;
            const isMyTurn = newTurn === myColor;
            
            // Log turn information for debugging
            console.log(`Game update: Turn=${newTurn}, My color=${myColor}, Is my turn=${isMyTurn}`);
            
            setGameData({
              ...gameData,
              state: data.state
            });
          }
        }
        
        else if (data.type === 'spectate_game') {
          setGameData({
            gameId: data.game_id,
            isSpectator: true,
            state: data.state,
            chatHistory: data.chat_history
          });
          setCurrentScreen('spectate');
        }
        
        else if (data.type === 'user_games') {
          setGameHistory(data.games);
        }
        
        else if (data.type === 'user_stats') {
          setUser({
            ...user,
            profile: {
              ...user.profile,
              ...data.stats
            }
          });
        }
        
        else if (data.type === 'error') {
          setErrorMessage(data.message);
          setTimeout(() => setErrorMessage(null), 5000);
        }
      };
      
      setSocket(newSocket);
    };

    // Initial connection
    connectWebSocket();
    
    // Cleanup on unmount
    return () => {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }
      if (socket) {
        socket.close();
      }
    };
  }, []);
  
  const handleLogin = (username, password, isRegistering) => {
    if (socket) {
      if (isRegistering) {
        // Send registration request
        socket.send(JSON.stringify({
          type: 'register',
          username: username,
          password: password
        }));
      } else if (password) {
        // Send login request (with password)
        socket.send(JSON.stringify({
          type: 'login',
          username: username,
          password: password
        }));
      } else {
        // Guest login (no password)
        socket.send(JSON.stringify({
          type: 'register',
          username: username
        }));
      }
      
      setUser({
        ...user,
        username: username
      });
    }
  };
  
  const handleFindMatch = () => {
    if (socket && user.isAuthenticated) {
      socket.send(JSON.stringify({
        type: 'find_match'
      }));
    }
  };
  
  const handleSpectate = (gameId) => {
    if (socket && user.isAuthenticated) {
      socket.send(JSON.stringify({
        type: 'spectate',
        game_id: gameId
      }));
      setSpectateGameId(gameId);
    }
  };
  
  const handleMove = (move) => {
    if (socket && gameData) {
      socket.send(JSON.stringify({
        type: 'make_move',
        move: move
      }));
    }
  };
  
  const handleSendChat = (message) => {
    if (socket && gameData) {
      socket.send(JSON.stringify({
        type: 'chat',
        message: message
      }));
    }
  };
  
  const handleLoadUserGames = () => {
    if (socket && user.isAuthenticated) {
      socket.send(JSON.stringify({
        type: 'get_user_games'
      }));
    }
  };
  
  const handleLoadUserStats = () => {
    if (socket && user.isAuthenticated && user.isRegistered) {
      socket.send(JSON.stringify({
        type: 'get_user_stats'
      }));
    }
  };
  
  const handleLogout = () => {
    if (socket) {
      // Close the current socket connection
      socket.close();
      
      // Reset user state
      setUser({
        username: '',
        playerId: null,
        isAuthenticated: false,
        isRegistered: false,
        profile: null
      });
      
      // Reset game data
      setGameData(null);
      setSpectateGameId(null);
      setGameHistory([]);
      
      // Go back to login screen
      setCurrentScreen('login');
      
      // Create a new socket connection
      const newSocket = new WebSocket('ws://localhost:8765');
      setSocket(newSocket);
    }
  };
  
  const goToLobby = () => {
    setCurrentScreen('lobby');
    setGameData(null);
    setSpectateGameId(null);
  };
  
  return (
    <Container fluid className="app-container">
      <Row className="header">
        <Col>
          <h1 className="text-center">Multiplayer Chess</h1>
        </Col>
      </Row>
      
      {user.isAuthenticated && (
        <Row className="navigation-bar">
          <Col>
            <Nav variant="tabs">
              <Nav.Item>
                <Nav.Link 
                  onClick={() => setCurrentScreen('lobby')} 
                  active={currentScreen === 'lobby'}
                >
                  Lobby
                </Nav.Link>
              </Nav.Item>
              {gameData && (
                <Nav.Item>
                  <Nav.Link 
                    onClick={() => setCurrentScreen(spectateGameId ? 'spectate' : 'game')} 
                    active={currentScreen === 'game' || currentScreen === 'spectate'}
                  >
                    {spectateGameId ? 'Spectating' : 'Playing'} Game
                  </Nav.Link>
                </Nav.Item>
              )}
              {user.isRegistered && (
                <>
                  <Nav.Item>
                    <Nav.Link 
                      onClick={() => {
                        handleLoadUserGames();
                        setCurrentScreen('history');
                      }}
                      active={currentScreen === 'history'}
                    >
                      Game History
                    </Nav.Link>
                  </Nav.Item>
                  <Nav.Item>
                    <Nav.Link 
                      onClick={() => {
                        handleLoadUserStats();
                        setCurrentScreen('profile');
                      }}
                      active={currentScreen === 'profile'}
                    >
                      Profile
                    </Nav.Link>
                  </Nav.Item>
                </>
              )}
            </Nav>
          </Col>
          <Col xs="auto" className="user-info">
            <span>
              Logged in as: <strong>{user.username}</strong>
              {user.isRegistered ? ' (Registered)' : ' (Guest)'}
            </span>
            <Button variant="outline-secondary" size="sm" className="ms-3" onClick={handleLogout}>
              Logout
            </Button>
          </Col>
        </Row>
      )}
      
      {errorMessage && (
        <Row className="mt-3">
          <Col>
            <Alert variant="danger">{errorMessage}</Alert>
          </Col>
        </Row>
      )}
      
      <Row className="content-area">
        <Col>
          {currentScreen === 'login' && (
            <Login onLogin={handleLogin} />
          )}
          
          {currentScreen === 'lobby' && (
            <Lobby 
              onFindMatch={handleFindMatch} 
              onSpectate={handleSpectate}
              socket={socket}
              isRegistered={user.isRegistered}
            />
          )}
          
          {currentScreen === 'game' && gameData && (
            <Game 
              gameData={gameData} 
              onMove={handleMove} 
              onSendChat={handleSendChat}
              socket={socket}
            />
          )}
          
          {currentScreen === 'spectate' && gameData && (
            <SpectateGame 
              gameData={gameData} 
              onSendChat={handleSendChat}
              onBack={goToLobby}
              socket={socket}
            />
          )}
          
          {currentScreen === 'history' && (
            <GameHistory 
              games={gameHistory}
              username={user.username}
              onLoadGames={handleLoadUserGames}
            />
          )}
          
          {currentScreen === 'profile' && (
            <UserProfile 
              userProfile={user.profile}
              onLoadStats={handleLoadUserStats}
            />
          )}
        </Col>
      </Row>
    </Container>
  );
}

export default App; 
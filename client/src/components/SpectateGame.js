import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Row, Col, Button, Badge } from 'react-bootstrap';
import { Chessboard } from 'react-chessboard';
import { Chess } from 'chess.js';
import { FaArrowLeft, FaEye, FaClock, FaUser, FaChessPawn, FaTrophy, FaExclamationTriangle } from 'react-icons/fa';

function SpectateGame({ gameData, onSendChat, onBack, socket }) {
  const [chess, setChess] = useState(new Chess());
  const [fen, setFen] = useState('start');
  const [gameStatus, setGameStatus] = useState('');
  const [chatMessages, setChatMessages] = useState([]);
  const [moveHistory, setMoveHistory] = useState([]);
  
  // Stable game ID for key prop
  const gameIdRef = useRef(gameData?.gameId || 'spectate-game');
  const previousFenRef = useRef('start');
  
  // Timers
  const [whiteTime, setWhiteTime] = useState(600);
  const [blackTime, setBlackTime] = useState(600);
  const timerRef = useRef(null);
  
  // Load the game state when it changes
  useEffect(() => {
    if (gameData && gameData.state) {
      try {
        // Update game ID for stable key
        if (gameData.gameId) {
          gameIdRef.current = gameData.gameId;
        }
        
        // Update chess board - only when FEN changes
        const newFen = gameData.state.board;
        
        if (previousFenRef.current !== newFen) {
          previousFenRef.current = newFen;
          setFen(newFen);
          
          const newChess = new Chess(newFen);
          setChess(newChess);
        }
        
        // Update timers
        setWhiteTime(gameData.state.white_time);
        setBlackTime(gameData.state.black_time);
        
        // Update move history
        setMoveHistory(gameData.state.move_history || []);
        
        // Initialize chat messages if available
        if (gameData.chatHistory && chatMessages.length === 0) {
          setChatMessages(gameData.chatHistory);
        }
        
        // Check game status
        if (gameData.state.status !== "ongoing") {
          if (gameData.state.status === "white_wins" || gameData.state.status === "white_wins_time" || gameData.state.status === "white_wins_disconnect") {
            setGameStatus(`${gameData.state.white_player} wins!`);
          }
          else if (gameData.state.status === "black_wins" || gameData.state.status === "black_wins_time" || gameData.state.status === "black_wins_disconnect") {
            setGameStatus(`${gameData.state.black_player} wins!`);
          }
          else if (gameData.state.status === "draw") {
            setGameStatus("Draw!");
          }
        }
        else if (gameData.state.is_check) {
          setGameStatus("Check!");
        }
        else if (gameData.state.is_checkmate) {
          setGameStatus("Checkmate!");
        }
        else if (gameData.state.is_stalemate) {
          setGameStatus("Stalemate!");
        }
        else {
          setGameStatus("");
        }
      } catch (error) {
        console.error("Error updating spectator chess state:", error);
      }
    }
  }, [gameData?.state, gameData?.gameId, chatMessages.length]);
  
  // Handle chat message updates
  useEffect(() => {
    if (!socket) return;
    
    const handleMessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "chat") {
        setChatMessages(prev => [...prev, data.message]);
      }
    };
    
    socket.addEventListener('message', handleMessage);
    
    return () => {
      socket.removeEventListener('message', handleMessage);
    };
  }, [socket]);
  
  // Timer effect for spectators - only for visual updates
  useEffect(() => {
    // Don't update locally, rely on server-provided times
    // This is just a visual aid in case server updates are slow
    if (gameData && gameData.state && gameData.state.status === 'ongoing') {
      // Clear any existing timer
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      
      // No need to count down actively for spectators as we receive regular updates
      // Just display the latest values from server
    }
    
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [gameData?.state?.status]);
  
  // Convert seconds to minutes:seconds format
  const formatTime = useCallback((seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  }, []);
  
  // Convert UCI notation (e2e4) to SAN notation (e4) for display
  const uciToSan = useCallback((uciMove) => {
    try {
      const tempChess = new Chess(chess.fen());
      const move = tempChess.move({
        from: uciMove.substring(0, 2),
        to: uciMove.substring(2, 4),
        promotion: uciMove.length > 4 ? uciMove.substring(4, 5) : undefined
      });
      return move.san;
    } catch (e) {
      return uciMove; // Fallback to UCI notation if conversion fails
    }
  }, [chess]);
  
  // Handle chat submission
  const [chatInput, setChatInput] = useState('');
  
  const handleSendChat = (e) => {
    e.preventDefault();
    if (chatInput.trim()) {
      onSendChat(chatInput);
      setChatInput('');
    }
  };
  
  // Determine if time is running low (less than 1 minute)
  const isTimeLow = useCallback((seconds) => seconds < 60, []);
  
  // Board configuration to prevent re-renders
  const boardConfig = useMemo(() => ({
    position: fen,
    boardOrientation: 'white',
    arePiecesDraggable: false,
    animationDuration: 200,
    customBoardStyle: {
      borderRadius: '8px',
      boxShadow: '0 4px 10px rgba(0, 0, 0, 0.2)'
    }
  }), [fen]);
  
  return (
    <div className="game-container">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <Button variant="outline-secondary" onClick={onBack} className="d-flex align-items-center">
          <FaArrowLeft className="me-2" /> Back to Lobby
        </Button>
        <Badge bg="info" className="py-2 px-3 d-flex align-items-center">
          <FaEye className="me-2" /> Spectator Mode
        </Badge>
      </div>
      
      {/* Game Status Banner */}
      {gameStatus && (
        <div className={`game-status ${gameData.state.status !== 'ongoing' ? 'ended' : 'active'}`}>
          {gameData.state.status !== 'ongoing' ? (
            <><FaTrophy className="me-2" />{gameStatus}</>
          ) : (
            <><FaExclamationTriangle className="me-2" />{gameStatus}</>
          )}
        </div>
      )}
      
      <Row>
        <Col lg={8}>
          {/* Player Info - Black */}
          <div className="game-info-panel">
            <div className="player-info">
              <div className={`player-name ${gameData.state.turn === 'black' ? 'active' : ''}`}>
                <FaUser />
                {gameData.state.black_player} (Black)
              </div>
              <div className={`timer ${gameData.state.turn === 'black' ? 'active' : ''} ${isTimeLow(blackTime) ? 'warning' : ''}`}>
                <FaClock className="me-1" />
                {formatTime(blackTime)}
              </div>
            </div>
          </div>
          
          {/* Chess Board */}
          <div className="game-board-container">
            <div style={{ width: '100%', maxWidth: '600px' }}>
              <Chessboard 
                key={gameIdRef.current}
                id={gameIdRef.current}
                {...boardConfig}
              />
            </div>
          </div>
          
          {/* Player Info - White */}
          <div className="game-info-panel">
            <div className="player-info">
              <div className={`player-name ${gameData.state.turn === 'white' ? 'active' : ''}`}>
                <FaUser />
                {gameData.state.white_player} (White)
              </div>
              <div className={`timer ${gameData.state.turn === 'white' ? 'active' : ''} ${isTimeLow(whiteTime) ? 'warning' : ''}`}>
                <FaClock className="me-1" />
                {formatTime(whiteTime)}
              </div>
            </div>
          </div>
        </Col>
        
        <Col lg={4}>
          {/* Move History */}
          <div className="mb-4">
            <h5 className="mb-3"><FaChessPawn className="me-2" />Move History</h5>
            <div className="move-history">
              <ul className="move-list">
                {moveHistory.map((move, idx) => (
                  <li key={idx} className="move-item">
                    <span className="move-number">{Math.floor(idx/2) + 1}.</span>
                    {idx % 2 === 0 ? '' : '... '}
                    <strong>{uciToSan(move)}</strong>
                  </li>
                ))}
                {moveHistory.length === 0 && (
                  <li className="text-center text-muted py-3">No moves yet</li>
                )}
              </ul>
            </div>
          </div>
          
          {/* Chat Section */}
          <div className="chat-container">
            <div className="chat-header">Spectator Chat</div>
            <div className="messages-container">
              {chatMessages.map((msg, idx) => (
                <div 
                  key={idx} 
                  className={`message ${msg.sender === "Spectator" ? 'message-self' : 'message-other'}`}
                >
                  <div><strong>{msg.sender}</strong>: {msg.message}</div>
                  <small className="text-white-50">{new Date(msg.timestamp * 1000).toLocaleTimeString()}</small>
                </div>
              ))}
              {chatMessages.length === 0 && (
                <div className="message-info">
                  Chat is empty. Be the first to comment on this game!
                </div>
              )}
            </div>
            <div className="chat-input-container">
              <form onSubmit={handleSendChat} className="d-flex w-100">
                <input
                  type="text"
                  className="chat-input"
                  placeholder="Type a message..."
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                />
                <button type="submit" className="send-button">
                  Send
                </button>
              </form>
            </div>
          </div>
        </Col>
      </Row>
    </div>
  );
}

export default SpectateGame; 
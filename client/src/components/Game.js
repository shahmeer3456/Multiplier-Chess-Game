import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Row, Col, Form, Button, Badge } from 'react-bootstrap';
import { Chessboard } from 'react-chessboard';
import { Chess } from 'chess.js';
import { FaChessPawn, FaClock, FaUser, FaTrophy, FaExclamationTriangle } from 'react-icons/fa';
import ChatWindow from './ChatWindow';

function Game({ gameData, onMove, onSendChat, socket }) {
  const [chess, setChess] = useState(new Chess());
  const [fen, setFen] = useState('start');
  const [isMyTurn, setIsMyTurn] = useState(false);
  const [gameStatus, setGameStatus] = useState('');
  const [chatMessages, setChatMessages] = useState([]);
  const [moveHistory, setMoveHistory] = useState([]);
  const [boardOrientation, setBoardOrientation] = useState('white');
  
  // Game ID for stable key
  const gameIdRef = useRef(gameData?.gameId || 'default-game');
  const previousFenRef = useRef('start');
  
  // Timers
  const [whiteTime, setWhiteTime] = useState(600);
  const [blackTime, setBlackTime] = useState(600);
  const timerRef = useRef(null);
  
  // Set board orientation once based on player color
  useEffect(() => {
    if (gameData && gameData.color) {
      setBoardOrientation(gameData.color);
      gameIdRef.current = gameData.gameId || 'default-game';
    }
  }, [gameData?.color, gameData?.gameId]);
  
  // Load the game state when it changes
  useEffect(() => {
    if (gameData && gameData.state) {
      try {
        // Create a new chess instance only when necessary
        const newFen = gameData.state.board;
        
        // Only update if FEN changed to prevent excessive re-renders
        if (previousFenRef.current !== newFen) {
          previousFenRef.current = newFen;
          setFen(newFen);
          
          const newChess = new Chess(newFen);
          setChess(newChess);
        }
        
        // Update turn information - this is critical for correct gameplay
        const isCurrentTurn = gameData.state.turn === gameData.color;
        setIsMyTurn(isCurrentTurn);
        console.log(`Turn updated: ${gameData.state.turn}, isMyTurn: ${isCurrentTurn}`);
        
        // Update timers
        setWhiteTime(gameData.state.white_time);
        setBlackTime(gameData.state.black_time);
        
        // Update move history
        setMoveHistory(gameData.state.move_history || []);
        
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
        console.error("Error updating chess state:", error);
      }
    }
  }, [gameData?.state]);
  
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
  
  // Timer effect - optimize to avoid unnecessary renders
  useEffect(() => {
    if (gameData && gameData.state && gameData.state.status === 'ongoing') {
      // Clear any existing timer
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      
      // Start a new timer that decrements ONLY the current player's time
      // Only run client-side timer for the active player to minimize synchronization issues
      if ((gameData.state.turn === 'white' && gameData.color === 'white') || 
          (gameData.state.turn === 'black' && gameData.color === 'black')) {
        timerRef.current = setInterval(() => {
          if (gameData.state.turn === 'white') {
            setWhiteTime(prev => Math.max(0, prev - 1));
          } else {
            setBlackTime(prev => Math.max(0, prev - 1));
          }
        }, 1000);
      }
    }
    
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [gameData?.state?.turn, gameData?.state?.status, gameData?.color]);
  
  // Convert seconds to minutes:seconds format
  const formatTime = useCallback((seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  }, []);
  
  // Handle piece movement - use useCallback to prevent unnecessary rerenders
  const onDrop = useCallback((sourceSquare, targetSquare) => {
    if (!isMyTurn) {
      console.log("Not your turn");
      return false;
    }
    
    try {
      // Try to make the move in our local chess instance
      const move = chess.move({
        from: sourceSquare,
        to: targetSquare,
        promotion: 'q', // Always promote to queen for simplicity
      });
      
      // If the move is legal, send it to the server
      if (move) {
        const moveString = `${sourceSquare}${targetSquare}`;
        onMove(moveString);
        // Temporarily set not my turn until server confirms
        setIsMyTurn(false);
        return true;
      }
    } catch (error) {
      console.error("Invalid move:", error);
    }
    
    return false;
  }, [chess, isMyTurn, onMove]);
  
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
  
  // Custom board configuration to prevent constant remounting
  const boardConfig = useMemo(() => ({
    position: fen,
    onPieceDrop: onDrop,
    boardOrientation: boardOrientation,
    arePremovesAllowed: true,
    animationDuration: 200,
    customBoardStyle: {
      borderRadius: '8px',
      boxShadow: '0 4px 10px rgba(0, 0, 0, 0.2)'
    }
  }), [fen, onDrop, boardOrientation]);
  
  return (
    <div className="game-container">
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
                {gameData.color === 'black' ? 'You' : gameData.state.black_player} (Black)
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
                {gameData.color === 'white' ? 'You' : gameData.state.white_player} (White)
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
            <div className="chat-header">Game Chat</div>
            <div className="messages-container">
              {chatMessages.map((msg, idx) => (
                <div 
                  key={idx} 
                  className={`message ${
                    msg.sender === (gameData.color === 'white' ? gameData.state.white_player : gameData.state.black_player) 
                      ? 'message-self' 
                      : 'message-other'
                  }`}
                >
                  <div><strong>{msg.sender}</strong>: {msg.message}</div>
                  <small className="text-white-50">{new Date(msg.timestamp * 1000).toLocaleTimeString()}</small>
                </div>
              ))}
              {chatMessages.length === 0 && (
                <div className="message-info">
                  Chat is empty. Say hello to your opponent!
                </div>
              )}
            </div>
            <div className="chat-input-container">
              <Form onSubmit={handleSendChat} className="d-flex w-100">
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
              </Form>
            </div>
          </div>
        </Col>
      </Row>
    </div>
  );
}

export default Game; 
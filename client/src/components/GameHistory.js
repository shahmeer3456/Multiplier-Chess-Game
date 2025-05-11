import React, { useEffect, useState } from 'react';
import { Card, Table, Button, Badge, Modal, Spinner } from 'react-bootstrap';
import { Chessboard } from 'react-chessboard';
import { Chess } from 'chess.js';

function GameHistory({ games, username, onLoadGames }) {
  const [selectedGame, setSelectedGame] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [moveIndex, setMoveIndex] = useState(0);
  const [position, setPosition] = useState(null);
  const [chess, setChess] = useState(null);

  useEffect(() => {
    if (!games || games.length === 0) {
      onLoadGames();
    }
  }, [games, onLoadGames]);

  const handleViewGame = (game) => {
    setSelectedGame(game);
    
    // Initialize chess board with starting position
    const newChess = new Chess();
    setChess(newChess);
    setPosition(newChess.fen());
    setMoveIndex(0);
    
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setSelectedGame(null);
    setMoveIndex(0);
  };

  const getGameResult = (game) => {
    if (game.status === 'draw') {
      return <Badge bg="warning">Draw</Badge>;
    } else if (game.winner === username) {
      return <Badge bg="success">Won</Badge>;
    } else {
      return <Badge bg="danger">Lost</Badge>;
    }
  };

  const getGameResultText = (game) => {
    if (game.status === 'draw') {
      return 'Draw';
    }
    
    if (game.winner === username) {
      return 'You won';
    } else {
      return 'You lost';
    }
    
    if (game.win_reason) {
      if (game.win_reason === 'checkmate') {
        return 'by checkmate';
      } else if (game.win_reason === 'time') {
        return 'on time';
      } else if (game.win_reason === 'disconnect') {
        return 'by disconnect';
      }
    }
    
    return '';
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return 'N/A';
    const date = new Date(timestamp * 1000);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  };

  const getOpponent = (game) => {
    return game.white_player === username ? game.black_player : game.white_player;
  };

  const handleNextMove = () => {
    if (!selectedGame || !chess || moveIndex >= selectedGame.moves.length) return;
    
    const move = selectedGame.moves[moveIndex].move;
    try {
      chess.move({
        from: move.substring(0, 2),
        to: move.substring(2, 4),
        promotion: move.length > 4 ? move.substring(4, 5) : undefined
      });
      setPosition(chess.fen());
      setMoveIndex(moveIndex + 1);
    } catch (error) {
      console.error("Invalid move:", error);
    }
  };

  const handlePreviousMove = () => {
    if (!selectedGame || !chess || moveIndex <= 0) return;
    
    chess.undo();
    setPosition(chess.fen());
    setMoveIndex(moveIndex - 1);
  };

  const handleResetBoard = () => {
    const newChess = new Chess();
    setChess(newChess);
    setPosition(newChess.fen());
    setMoveIndex(0);
  };

  const handlePlayToEnd = () => {
    if (!selectedGame || !chess) return;
    
    const newChess = new Chess();
    for (let i = 0; i < selectedGame.moves.length; i++) {
      const move = selectedGame.moves[i].move;
      try {
        newChess.move({
          from: move.substring(0, 2),
          to: move.substring(2, 4),
          promotion: move.length > 4 ? move.substring(4, 5) : undefined
        });
      } catch (error) {
        console.error("Invalid move:", error);
        break;
      }
    }
    
    setChess(newChess);
    setPosition(newChess.fen());
    setMoveIndex(selectedGame.moves.length);
  };

  if (!games || games.length === 0) {
    return (
      <div className="text-center my-5">
        <Spinner animation="border" role="status">
          <span className="visually-hidden">Loading...</span>
        </Spinner>
        <p className="mt-3">Loading your game history...</p>
      </div>
    );
  }

  return (
    <div className="game-history-container">
      <h2 className="mb-4">Game History</h2>
      
      <Card>
        <Card.Header className="d-flex justify-content-between align-items-center">
          <h5 className="mb-0">Your Past Games</h5>
          <Button variant="outline-primary" size="sm" onClick={onLoadGames}>
            Refresh History
          </Button>
        </Card.Header>
        <Card.Body>
          <Table responsive striped hover>
            <thead>
              <tr>
                <th>Date</th>
                <th>Opponent</th>
                <th>Your Color</th>
                <th>Result</th>
                <th>Moves</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {games.map((game, index) => (
                <tr key={index}>
                  <td>{formatDate(game.start_time)}</td>
                  <td>{getOpponent(game)}</td>
                  <td>
                    {game.white_player === username ? 'White' : 'Black'}
                  </td>
                  <td>{getGameResult(game)}</td>
                  <td>{game.moves ? game.moves.length : 0}</td>
                  <td>
                    <Button 
                      variant="outline-secondary" 
                      size="sm"
                      onClick={() => handleViewGame(game)}
                    >
                      View Game
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
          
          {games.length === 0 && (
            <p className="text-center">You haven't played any games yet.</p>
          )}
        </Card.Body>
      </Card>
      
      {/* Game Replay Modal */}
      <Modal show={showModal} onHide={handleCloseModal} size="lg">
        <Modal.Header closeButton>
          <Modal.Title>
            Game Review: {selectedGame && `${selectedGame.white_player} vs ${selectedGame.black_player}`}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {selectedGame && (
            <div>
              <div className="game-info mb-3">
                <div><strong>Date:</strong> {formatDate(selectedGame.start_time)}</div>
                <div>
                  <strong>Result:</strong> {getGameResultText(selectedGame)}
                  {selectedGame.win_reason && ` (${selectedGame.win_reason})`}
                </div>
                <div>
                  <strong>Your color:</strong> {selectedGame.white_player === username ? 'White' : 'Black'}
                </div>
                <div>
                  <strong>Move:</strong> {moveIndex} / {selectedGame.moves ? selectedGame.moves.length : 0}
                </div>
              </div>
              
              <div className="board-container mb-3">
                <Chessboard 
                  position={position}
                  boardOrientation={selectedGame.white_player === username ? 'white' : 'black'}
                  arePiecesDraggable={false}
                />
              </div>
              
              <div className="d-flex justify-content-between">
                <Button 
                  variant="outline-secondary" 
                  onClick={handleResetBoard}
                >
                  Reset
                </Button>
                <div>
                  <Button 
                    variant="outline-primary" 
                    onClick={handlePreviousMove}
                    disabled={moveIndex <= 0}
                    className="me-2"
                  >
                    Previous
                  </Button>
                  <Button 
                    variant="outline-primary" 
                    onClick={handleNextMove}
                    disabled={moveIndex >= (selectedGame.moves ? selectedGame.moves.length : 0)}
                  >
                    Next
                  </Button>
                </div>
                <Button 
                  variant="outline-success" 
                  onClick={handlePlayToEnd}
                  disabled={moveIndex >= (selectedGame.moves ? selectedGame.moves.length : 0)}
                >
                  Play to End
                </Button>
              </div>
            </div>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={handleCloseModal}>
            Close
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
}

export default GameHistory; 
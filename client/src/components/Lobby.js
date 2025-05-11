import React, { useState, useEffect } from 'react';
import { Button, Spinner, Row, Col, Badge } from 'react-bootstrap';
import { FaChess, FaEye, FaUserCircle, FaSearch, FaPlayCircle, FaSync, FaUsers } from 'react-icons/fa';

function Lobby({ onFindMatch, onSpectate, socket, isRegistered }) {
  const [availableGames, setAvailableGames] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [waitingMessage, setWaitingMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (socket) {
      // Ask for the list of games when component mounts
      socket.send(JSON.stringify({ type: 'list_games' }));

      // Setup listener for lobby status messages
      const messageHandler = (event) => {
        const data = JSON.parse(event.data);
        
        if (data.type === 'lobby_status') {
          setIsSearching(true);
          setWaitingMessage(`Waiting for an opponent... Queue position: ${data.queue_position}`);
        }
        else if (data.type === 'games_list') {
          setAvailableGames(data.games);
          setIsLoading(false);
        }
        else if (data.type === 'game_start') {
          setIsSearching(false);
        }
      };

      socket.addEventListener('message', messageHandler);

      // Refresh the list every 10 seconds
      const interval = setInterval(() => {
        socket.send(JSON.stringify({ type: 'list_games' }));
      }, 10000);

      return () => {
        socket.removeEventListener('message', messageHandler);
        clearInterval(interval);
      };
    }
  }, [socket]);

  const handleFindMatch = () => {
    setIsSearching(true);
    setWaitingMessage('Finding an opponent...');
    onFindMatch();
  };

  const handleSpectate = (gameId) => {
    onSpectate(gameId);
  };

  const refreshGamesList = () => {
    setIsLoading(true);
    socket.send(JSON.stringify({ type: 'list_games' }));
  };

  return (
    <div className="lobby-container">
      {/* Play Game Card */}
      <div className="lobby-card">
        <div className="lobby-card-header">
          <FaChess className="me-2" />Play a Chess Game
        </div>
        
        <Row className="align-items-center mb-4">
          <Col md={8}>
            <p className="mb-4">
              Join the matchmaking queue to play against another player in real-time.
              Make strategic moves, manage your clock, and checkmate your opponent!
            </p>
            
            {isSearching ? (
              <div className="d-flex align-items-center bg-light p-3 rounded">
                <Spinner animation="border" variant="primary" size="sm" className="me-3" />
                <div>
                  <div className="fw-bold">Matchmaking in progress</div>
                  <div className="text-muted">{waitingMessage}</div>
                </div>
              </div>
            ) : (
              <Button 
                variant="primary" 
                size="lg" 
                className="d-flex align-items-center"
                onClick={handleFindMatch}
              >
                <FaPlayCircle className="me-2" />
                Find a Match
              </Button>
            )}
          </Col>
          
          <Col md={4}>
            <div className={`p-4 rounded text-center ${isRegistered ? 'bg-light' : 'bg-warning bg-opacity-10'}`}>
              <div className="mb-3">
                <FaUserCircle size={40} color={isRegistered ? '#2ecc71' : '#f39c12'} />
              </div>
              <h5>
                {isRegistered ? 'Registered Player' : 'Guest Player'}
              </h5>
              <Badge bg={isRegistered ? 'success' : 'warning'} className="mb-2">
                {isRegistered ? 'Stats Tracked' : 'Limited Features'}
              </Badge>
              <p className="small mb-0 text-muted">
                {isRegistered 
                  ? 'Your games and stats will be saved to your profile.'
                  : 'Playing as guest. Create an account to save your games and stats.'}
              </p>
            </div>
          </Col>
        </Row>
      </div>

      {/* Spectate Games Card */}
      <div className="lobby-card">
        <div className="lobby-card-header">
          <FaEye className="me-2" />Spectate Live Games
        </div>
        
        {isLoading ? (
          <div className="text-center py-5">
            <Spinner animation="border" variant="primary" />
            <p className="mt-3">Loading available games...</p>
          </div>
        ) : availableGames.length > 0 ? (
          <>
            <div className="games-list">
              {availableGames.map((game) => (
                <div key={game.game_id} className="game-item">
                  <div className="game-players">
                    <span className="fw-bold text-primary">{game.white_player}</span>
                    <span className="mx-2 text-muted">vs</span>
                    <span className="fw-bold text-dark">{game.black_player}</span>
                    <Badge bg="light" text="dark" className="ms-3">
                      {game.move_count} {game.move_count === 1 ? 'move' : 'moves'}
                    </Badge>
                  </div>
                  
                  <div className="d-flex align-items-center">
                    <div className="spectator-count me-3">
                      <FaUsers size={14} />
                      <span>{game.spectator_count}</span>
                    </div>
                    <Button 
                      variant="outline-primary" 
                      size="sm" 
                      className="d-flex align-items-center"
                      onClick={() => handleSpectate(game.game_id)}
                    >
                      <FaEye className="me-1" />
                      Watch
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            
            <div className="text-center mt-4">
              <Button 
                variant="outline-secondary" 
                size="sm" 
                className="d-flex align-items-center mx-auto"
                onClick={refreshGamesList}
              >
                <FaSync className="me-2" />
                Refresh Games List
              </Button>
            </div>
          </>
        ) : (
          <div className="text-center py-5">
            <FaSearch size={48} className="text-muted mb-3" />
            <h5>No Active Games</h5>
            <p className="text-muted">There are no games to spectate at the moment.</p>
            <p className="mb-0">Start a game yourself or check back later!</p>
            
            <Button 
              variant="outline-secondary" 
              size="sm" 
              className="mt-3 d-flex align-items-center mx-auto"
              onClick={refreshGamesList}
            >
              <FaSync className="me-2" />
              Refresh
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

export default Lobby; 
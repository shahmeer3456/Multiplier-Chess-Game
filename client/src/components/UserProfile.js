import React, { useEffect } from 'react';
import { Card, Row, Col, Button, Badge } from 'react-bootstrap';

function UserProfile({ userProfile, onLoadStats }) {
  useEffect(() => {
    if (!userProfile) {
      onLoadStats();
    }
  }, [userProfile, onLoadStats]);

  const formatDate = (timestamp) => {
    if (!timestamp) return 'N/A';
    const date = new Date(timestamp * 1000);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  };

  if (!userProfile) {
    return (
      <div className="text-center my-5">
        <div className="spinner-border" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
        <p className="mt-3">Loading your profile...</p>
      </div>
    );
  }

  const totalGames = userProfile.games_played || 0;
  const winRate = totalGames > 0 ? Math.round((userProfile.wins / totalGames) * 100) : 0;

  return (
    <div className="profile-container">
      <h2 className="mb-4">Player Profile</h2>
      
      <Card className="mb-4">
        <Card.Header as="h5">
          <Row className="align-items-center">
            <Col>
              {userProfile.username}
            </Col>
            <Col xs="auto">
              <Button variant="outline-primary" size="sm" onClick={onLoadStats}>
                Refresh Stats
              </Button>
            </Col>
          </Row>
        </Card.Header>
        <Card.Body>
          <Row>
            <Col md={6}>
              <h5>Account Information</h5>
              <p><strong>Username:</strong> {userProfile.username}</p>
              <p><strong>Member Since:</strong> {formatDate(userProfile.join_date)}</p>
              <p><strong>Last Login:</strong> {formatDate(userProfile.last_login)}</p>
            </Col>
            <Col md={6}>
              <h5>Game Statistics</h5>
              <div className="d-flex justify-content-between mb-3">
                <div className="text-center">
                  <h3>{totalGames}</h3>
                  <div>Total Games</div>
                </div>
                <div className="text-center">
                  <h3>{winRate}%</h3>
                  <div>Win Rate</div>
                </div>
              </div>
              
              <div className="d-flex justify-content-around my-4">
                <div className="text-center">
                  <Badge bg="success" className="stats-badge">{userProfile.wins || 0}</Badge>
                  <div>Wins</div>
                </div>
                <div className="text-center">
                  <Badge bg="danger" className="stats-badge">{userProfile.losses || 0}</Badge>
                  <div>Losses</div>
                </div>
                <div className="text-center">
                  <Badge bg="warning" className="stats-badge">{userProfile.draws || 0}</Badge>
                  <div>Draws</div>
                </div>
              </div>
            </Col>
          </Row>
        </Card.Body>
      </Card>
      
      <Card>
        <Card.Header>
          <h5>Player Information</h5>
        </Card.Header>
        <Card.Body>
          <p>
            Your game statistics are tracked for all registered games. Play more games to build your profile
            and improve your win rate!
          </p>
          <p>
            View your game history tab to see details of your past games, including move history and results.
          </p>
        </Card.Body>
      </Card>
    </div>
  );
}

export default UserProfile; 
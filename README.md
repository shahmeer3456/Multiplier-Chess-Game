# MongoDB Integration for Chess Game

This document explains how to set up and use the MongoDB integration for the multiplayer chess game.

## Prerequisites

- MongoDB installed locally or a MongoDB Atlas account
- Python 3.7+ with pymongo and bcrypt packages

## Configuration

1. Edit the `config.env` file to set your MongoDB connection string:

```
# MongoDB configuration
MONGO_URI=mongodb://localhost:27017/
DB_NAME=chess_game

# Server configuration
SERVER_HOST=0.0.0.0
SERVER_PORT=8765
```

If you're using MongoDB Atlas, replace the URI with your connection string:

```
MONGO_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/
```

## Database Structure

The application uses the following collections:

### Users Collection
Stores user accounts and statistics:
- `username`: Unique username
- `password`: Bcrypt hashed password
- `created_at`: Account creation timestamp
- `last_login`: Last login timestamp
- `games_played`: Total number of games played
- `wins`: Number of games won
- `losses`: Number of games lost
- `draws`: Number of games drawn

### Games Collection
Stores game records:
- `game_id`: Unique game identifier (matches in-memory game ID)
- `white_player`: Username of the white player
- `black_player`: Username of the black player
- `status`: Game status (ongoing, draw, white_wins, black_wins, etc.)
- `moves`: Array of move objects with move notation and timestamps
- `start_time`: When the game started
- `end_time`: When the game ended (null for ongoing games)
- `winner`: Username of the winner (null for draws or ongoing)
- `win_reason`: Reason for win (checkmate, time, disconnect)

### Chat Messages Collection
Stores chat messages:
- `game_id`: ID of the game the message belongs to
- `sender`: Username of the sender
- `message`: Content of the message
- `timestamp`: When the message was sent
- `is_spectator`: Whether the sender is a spectator

### Spectator Logs Collection
Tracks spectator activity:
- `game_id`: ID of the game being spectated
- `spectator_id`: Unique ID of the spectator
- `username`: Username of the spectator
- `action`: Type of action (join, leave)
- `timestamp`: When the action occurred

## Features

The MongoDB integration provides the following features:

1. **User Authentication**
   - Register new users with hashed passwords
   - Login with username/password
   - Guest login (no persistence)

2. **Game History**
   - Store all moves made in a game
   - Record game outcomes and statistics
   - Calculate win/loss ratios

3. **Chat History**
   - Store all chat messages
   - Associate messages with specific games
   - Mark messages from spectators

4. **Spectator Tracking**
   - Track who is spectating which games
   - Count active spectators per game
   - Log when spectators join and leave

## API

The server provides the following MongoDB-related API endpoints:

- `register`: Register a new user account
- `login`: Authenticate a user
- `get_user_games`: Get a user's game history
- `get_user_stats`: Get a user's statistics

## Security Considerations

- Passwords are hashed using bcrypt
- MongoDB connection string should not be checked into source control
- Use appropriate MongoDB Atlas user permissions if using cloud hosting
- Consider setting up MongoDB authentication if running locally

## Troubleshooting

1. If you cannot connect to MongoDB, check:
   - MongoDB service is running
   - Connection string is correct
   - Network firewall allows connections

2. If data isn't being saved:
   - Check database permissions
   - Verify the collections exist
   - Check for errors in the server logs 

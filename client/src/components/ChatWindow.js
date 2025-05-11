import React, { useEffect, useRef } from 'react';

function ChatWindow({ messages, currentUser, isSpectator = false }) {
  const chatEndRef = useRef(null);
  
  // Auto-scroll to the bottom when new messages arrive
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);
  
  // Format timestamp to readable time
  const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };
  
  // Determine message styling based on sender
  const getMessageClass = (sender) => {
    if (sender.startsWith('Spectator:')) {
      return 'message message-spectator';
    }
    
    return sender === currentUser ? 'message message-self' : 'message message-other';
  };
  
  return (
    <div className="messages-container">
      {messages.length === 0 ? (
        <div className="message-info">
          No messages yet. Start the conversation!
        </div>
      ) : (
        messages.map((message, index) => (
          <div key={index} className={getMessageClass(message.sender)}>
            <div>
              <strong>{message.sender}</strong>: {message.message}
            </div>
            <small className="text-black-50">{formatTimestamp(message.timestamp)}</small>
          </div>
        ))
      )}
      <div ref={chatEndRef}></div>
    </div>
  );
}

export default ChatWindow; 
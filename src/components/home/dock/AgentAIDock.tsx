import React, { useState } from 'react';

interface Message {
  id: string;
  sender: 'user' | 'agent';
  type: 'text' | 'tool_execution';
  content: string;
  tool?: string;
}

const initialMessages: Message[] = [
  { id: '1', sender: 'user', type: 'text', content: 'Hi, can I book a salsa class?' },
  { id: '2', sender: 'agent', type: 'tool_execution', tool: 'bookCoach', content: 'Classifying intent: BOOK_COACH...' },
  {
    id: '3',
    sender: 'agent',
    type: 'text',
    content: 'Sure! I found available Salsa Gold classes. Would you like Tuesday at 6 PM with Coach Clara?',
  },
  { id: '4', sender: 'user', type: 'text', content: 'Yes, that works perfect!' },
  {
    id: '5',
    sender: 'agent',
    type: 'tool_execution',
    tool: 'Booking',
    content: 'Creating booking... ✓ Booking confirmed! Your class is on Tuesday at 6 PM.',
  },
];

export const AgentAIDock: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState('');

  const handleSend = () => {
    if (!input.trim()) return;

    const newMessage: Message = {
      id: String(messages.length + 1),
      sender: 'user',
      type: 'text',
      content: input,
    };

    setMessages([...messages, newMessage]);

    // Simulate agent response
    setTimeout(() => {
      const agentMessages: Message[] = [
        {
          id: String(messages.length + 2),
          sender: 'agent',
          type: 'tool_execution',
          tool: 'Processing',
          content: 'Processing your request...',
        },
        {
          id: String(messages.length + 3),
          sender: 'agent',
          type: 'text',
          content: 'I understood your request. How else can I help you today?',
        },
      ];
      setMessages((prev) => [...prev, ...agentMessages]);
    }, 500);

    setInput('');
  };

  return (
    <div className="agent-dock">
      <div className="dock-header">
        <div className="dock-status">
          <span className="status-dot"></span>
          <span>Agent AI Dock</span>
        </div>
        <button className="dock-close-btn">✕</button>
      </div>

      <div className="dock-messages">
        {messages.map((msg) => (
          <div key={msg.id} className={`message ${msg.sender}`}>
            <div className="message-bubble">
              {msg.type === 'tool_execution' && (
                <div style={{ fontSize: '10px', fontWeight: 600, marginBottom: '4px', opacity: 0.8 }}>
                  ⚙️ {msg.tool}: {msg.content}
                </div>
              )}
              {msg.type === 'text' && <div>{msg.content}</div>}
            </div>
          </div>
        ))}
      </div>

      <div className="dock-input">
        <input
          type="text"
          placeholder="Type a message..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleSend()}
        />
        <button onClick={handleSend}>Send</button>
      </div>
    </div>
  );
};

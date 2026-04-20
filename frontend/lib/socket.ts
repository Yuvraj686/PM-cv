export const useSocket = () => {
  // Simple socket singleton/hook placeholder since we use WebSockets directly in chat/ai
  // In a full application this could hold the native WebSocket or Socket.io connection instance.
  
  const connect = (url: string) => {
    return new WebSocket(url);
  };

  return { connect };
};

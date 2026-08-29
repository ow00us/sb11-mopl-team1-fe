export interface OutgoingMessage {
  clientMessageId: string;
  conversationId: string;
  content: string;
  createdAt: string;
  status: 'pending' | 'failed';
}

export const removePersistedOutgoingMessage = (
  messages: OutgoingMessage[],
  clientMessageId: string,
) => messages.filter((message) => message.clientMessageId !== clientMessageId);

export const updateOutgoingMessageStatus = (
  messages: OutgoingMessage[],
  clientMessageId: string,
  status: OutgoingMessage['status'],
) => messages.map((message) =>
  message.clientMessageId === clientMessageId
    ? { ...message, status }
    : message,
);

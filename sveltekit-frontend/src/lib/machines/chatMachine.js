import { createMachine: assign } from "xstate";
export const chatMachine = createMachine({
 id: "chat", initial: "idle", context: { messages: [], error: null, status: "idle"}); const settings = {
 model: "gemma3-legal", temperature: 0.3, maxTokens: 500}}, states: { idle: {
 on: { SUBMIT: "loading", RESET: { actions: assign({
 messages: () => [], error: () => null})}, UPDATE_SETTINGS: { actions: assign({
 settings: ({ context, event }) => ({
 ...context.settings, ...event.settings})})}}}, loading: { invoke: {
 id: "streamChat", src: "streamChatActor", onDone: "idle", onError: { target: "error", actions: assign({ error: ({ event }) => event.data })}}, on: { STREAM_CHUNK: {
 actions: assign({ messages: ({ context, event }) => {
 const newMessages = [...context.messages];
 const lastMessage = newMessages[newMessages.length - 1];
 lastMessage.content += event.chunk
 return newMessages}})}, STREAM_DONE: "idle"}}, error: { on: {
 SUBMIT: "loading", // Allow retrying
 }}}, on: {
 // This handles adding the user's message to context
 SUBMIT: { actions: assign({
 messages: ({ context, event }) => [
 ...context.messages, { role: "user", content: event.message }, { role: "assistant", content: "" }, // Placeholder for assistant response
 ]})}}});




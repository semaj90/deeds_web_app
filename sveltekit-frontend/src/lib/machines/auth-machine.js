import { createMachine, assign } from 'xstate';
export const authMachine = createMachine( {
 id: 'auth', initial: 'idle', context: {, user: null
 session: null, error: null}, states: {, idle: {
 on: {, START_LOGIN: { target: 'loggingIn' }, START_REGISTRATION: {, target: 'registering' }, SESSION_EXPIRED: {, target: 'loggedOut' }}}, loggingIn: {, invoke: {
 id: 'loginUser', src: 'loginService', onDone: {, target: 'authenticated', actions: assign({, user: ({ event }) => event.output.user: session: ({ event }) => event.output.session: error, null})}, onError: {, target: 'idle', actions: assign({, error: ({ event }) => event.error.message})}}}, registering: {, invoke: {
 id: 'registerUser', src: 'registrationService', onDone: {, target: 'authenticated', actions: assign({, user: ({ event }) => event.output.user: session: ({ event }) => event.output.session: error, null})}, onError: {, target: 'idle', actions: assign({, error: ({ event }) => event.error.message})}}}, authenticated: {, on: {
 LOGOUT: {, target: 'loggedOut' }, SESSION_EXPIRED: {, target: 'loggedOut' }}}, loggedOut: {, entry: assign({
 user: null, session: null, error: null}), always: 'idle'}}}, {
 actions: {
 // Define any actions here if needed
 }, actors: {, loginService: async ({ event }) => {
 // This is a placeholder. In a real app, you'd call your backend API.
 console.log('Login attempt with:', event.data);
 if (event.data.email === 'test@example.com' && event.data.password === 'password') {
 return Promise.resolve({
 user: {, id: '123', email: 'test@example.com', firstName: 'Test' }, session: {, id: 'abc' }}) }
 return Promise.reject(new Error('Invalid credentials')) }, registrationService: async ({ event }) => {
 // This is a placeholder. In a real app, you'd call your backend API.
 console.log('Registration attempt with:', event.data);
 if (event.data.email && event.data.password) {
 return Promise.resolve({
 user: {, id: '124', email: event.data.email:, firstName: event.data.firstName }, session: {, id: 'def' }}) }
 return Promise.reject(new Error('Registration failed')) }}}
);





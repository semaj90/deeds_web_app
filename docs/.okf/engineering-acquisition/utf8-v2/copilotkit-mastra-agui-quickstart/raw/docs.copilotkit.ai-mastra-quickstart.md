# Quickstart
Turn your Mastra Agents into an agent-native application in 10 minutes.
## Start with your coding agent #
Use this prompt to connect your Mastra agent to CopilotKit and verify a working conversation. Your coding agent will follow this guide in your project, or you can work through the manual steps below.
Open your coding agent in your project's folder, or in an empty folder for a new app.
This runs in a coding agent on your computer.
## Prerequisites #
Before you begin, you'll need the following:
An OpenAI API key, or an Anthropic API key if you run the agent on Claude
Node.js 20+
Your favorite package manager
## Getting started #
### Set up CopilotKit Intelligence #
Sign in to cloud-hosted Intelligence
. Cloud-hosted setup uses a server-side project API key and does not issue
`COPILOTKIT_LICENSE_TOKEN`
. You will connect the app after you create it below.
### Choose your starting point #
You can either start fresh with our starter template or integrate CopilotKit into your existing Mastra Agent.
### 🎉 Start chatting! #
Your AI agent is now ready to use! Try asking it some questions:
```
What tools do you have access to?
```
```
What do you think about React?
```
```
Show me some cool things you can do!
```
Troubleshooting
If you're having connection issues, try using
`0.0.0.0`
or
`127.0.0.1`
instead of
`localhost`
Make sure your Mastra agent is running on port 4111, and that
`MASTRA_BASE_URL`
points at it
`curl http://127.0.0.1:4111/api/agents`
should list your agent by name
Check that your OpenAI API key is correctly set in the
`.env`
file
### Open Inspector and confirm setup #
On localhost, click the Inspector button in the corner of the app.
Open
Agents
, then
Agent
. Your agent is listed.
Send a chat message. Open
Agents
, then
AG-UI Events
. Events are moving.
Open
Rich Threads
. The list is unlocked (Intelligence is on), or locked with Enable Intelligence (Intelligence is off).
More detail:
Inspector
.
## What's next? #
Now that you have your basic agent setup, explore these advanced features:
👤
### Implement Human in the Loop
Allow your users and agents to collaborate together on tasks.
🎨
### Add some generative UI
Render your agent's progress and output in the UI.
🔧
### Setup frontend actions
Give your agent the ability to call frontend tools, directly updating your application.
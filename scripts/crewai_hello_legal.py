import os
from crewai import Agent, Task, Crew, Process
from crewai import Agent, Task, Crew, Process, LLM
from langfuse.langchain import CallbackHandler

# 🛠️ PHASE 96: LOCAL AGENTIC STACK CONFIG
# 100% Local, $0/month, Fully Traceable

# 1. Setup Observability (Local Langfuse)
os.environ["LANGFUSE_PUBLIC_KEY"] = "pk-lf-public" # Default local keys
os.environ["LANGFUSE_SECRET_KEY"] = "sk-lf-secret"
os.environ["LANGFUSE_HOST"] = "http://localhost:3030"

langfuse_handler = CallbackHandler()

# 2. Setup Local LLM (Ollama via CrewAI Native LLM)
# This is the most robust way to use local models in CrewAI 1.8+
llm = LLM(
    model="ollama/gemma3-legal:latest",
    base_url="http://localhost:11434",
    temperature=0.1,
    # callbacks=[langfuse_handler] # We'll re-enable this if LLM supports it, or use Task level
)

# 3. Define the Legal Agent
researcher = Agent(
    role='Expert Legal Researcher',
    goal='Identify relevant legal precedents and statutes for contract disputes',
    backstory="""You are a senior paralegal specialized in automated legal research.
    You have access to a vast database of case law and you excel at finding
    nuanced legal arguments.""",
    verbose=True,
    allow_delegation=False,
    llm=llm
)

# 4. Define the Task
task1 = Task(
    description="""Analyze a hypothetical scenario where a software developer
    is suing a client for non-payment despite a vague 'satisfaction guaranteed' clause.
    Provide 3 specific areas of case law or UCC sections that apply.""",
    expected_output="A list of 3 legal sections with brief explanations.",
    agent=researcher
)

# 5. Execute the Crew
crew = Crew(
    agents=[researcher],
    tasks=[task1],
    verbose=True,
    process=Process.sequential
)

print("\n🚀 Starting Local Legal Research Crew...")
result = crew.kickoff()

print("\n\n########################")
print("## RESULT FROM AGENT")
print("########################\n")
print(result)

print(f"\n✅ Trace available at: {os.environ['LANGFUSE_HOST']}")

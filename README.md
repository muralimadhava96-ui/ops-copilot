# Stadium Ops Copilot

Stadium Ops Copilot is a real-time tactical command center I built for the Prompt Wars challenge. It's designed to manage high-density venue operations (like 80,000 fans moving through a stadium) by synthesizing raw IoT and crowd density data into actionable recommendations.

**Live Demo:** [https://muralimadhava96-ui.github.io/ops-copilot/](https://muralimadhava96-ui.github.io/ops-copilot/)

## 📸 Dashboard Preview
![Stadium Ops Copilot Dashboard](demo_screenshot.png)

## The Problem

In modern stadium operations, operators usually have to juggle fragmented legacy systems. When high-stress scenarios happen—like a gate surge or a medical emergency—it's easy for cognitive overload to lead to delayed responses or misallocated resources. The goal of this project was to build a unified layer that helps operators make decisions faster and safer.

## How it Works

The application simulates ingesting IoT crowd density data and uses Google Gemini 2.0 Flash to act as a "copilot" for the Ops Commander. 

I focused on a few core concepts to make this actually usable in a real-world setting:

1. **"Glass Box" AI Reasoning**: The system doesn't just issue blind commands. It gives a Confidence Score (e.g. `CONF: 89%`), explains explicit trade-offs (e.g. "Warning: This leaves Zone C with 0 available Medical Teams"), and shows alternative actions it considered. This keeps the human fully in the loop.
2. **Operational Safety**: Since AI in the physical world needs physical safeguards, I added things like a 3-second abort countdown for PA broadcasts and immutable audit trails that log every manual override by the operator.
3. **Graceful Degradation**: If the backend server is unreachable, the UI seamlessly falls back to a locally mocked static mode. The operator is never left staring at a broken screen during a crisis.

## Tech Stack

I wanted to keep the architecture as lightweight and fast as possible:
* **Frontend**: Pure HTML5 and Vanilla JS, styled with Tailwind CSS via CDN. No heavy frameworks meant 0ms hydration overhead.
* **Backend Framework**: Python 3 with FastAPI and Uvicorn.
* **AI Integration**: The `google-genai` SDK powered by Gemini 2.0 Flash for low-latency inference.
* **Hosting**: The frontend is deployed statically on GitHub Pages, ensuring zero downtime and immediate access.

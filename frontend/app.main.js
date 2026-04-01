const chatForm = document.getElementById("chat-form");
const userInput = document.getElementById("user-input");
const responseBox = document.getElementById("response");
const loadingText = document.getElementById("loading");

const BACKEND_URL = "https://chatfusion-backend.onrender.com/chat";

chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const question = userInput.value.trim();

  if (!question) {
    alert("Please enter a question");
    return;
  }

  // Get selected models
  const selectedModels = [];
  document.querySelectorAll(".model-checkbox:checked").forEach((checkbox) => {
    selectedModels.push(checkbox.value);
  });

  if (selectedModels.length === 0) {
    alert("Select at least one model");
    return;
  }

  // UI updates
  loadingText.style.display = "block";
  responseBox.innerHTML = "";

  try {
    const res = await fetch(BACKEND_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        question: question,
        activeModels: selectedModels
      })
    });

    if (!res.ok) {
      throw new Error(`Server error: ${res.status}`);
    }

    const data = await res.json();

    // Display result
    responseBox.innerHTML = `
      <h3>Final Answer:</h3>
      <p>${data.final}</p>

      <h4>Confidence Score:</h4>
      <p>${data.confidenceScore}%</p>

      <h4>Model Ranking:</h4>
      <ul>
        ${data.ranking.map(r => `<li>#${r.rank} - ${r.model}</li>`).join("")}
      </ul>
    `;

  } catch (error) {
    console.error(error);
    responseBox.innerHTML = `<p style="color:red;">Error: ${error.message}</p>`;
  } finally {
    loadingText.style.display = "none";
  }
});
import { GoogleGenAI } from "@google/genai";
import { Movement, Employee } from "../types";

const getClient = () => {
  // Safe initialization
  const apiKey = process.env.API_KEY;
  if (!apiKey || apiKey.length === 0 || apiKey === 'undefined') return null;
  return new GoogleGenAI({ apiKey });
};

export const analyzeExpenses = async (movements: Movement[], employees: Employee[]) => {
  const ai = getClient();
  if (!ai) {
    return "API Key ist nicht konfiguriert. Bitte setzen Sie die Umgebungsvariable API_KEY.";
  }

  // Prepare data context
  const summaryData = movements.map(m => {
    const emp = employees.find(e => e.id === m.employeeId);
    return `Date: ${m.date}, Emp: ${emp?.lastName}, Loc: ${m.location}, Dur: ${m.durationNetto}h, Amt: ${m.amount}€`;
  }).join('\n');

  const prompt = `
    Analyze the following expense report data for meal allowances (Spesen).
    Identify:
    1. Total cost.
    2. Any anomalies (e.g., very long hours, frequent travel to same location).
    3. A brief summary of the month's activity.
    
    Data:
    ${summaryData}
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });
    return response.text || "No analysis generated.";
  } catch (error) {
    console.error("Gemini Error:", error);
    return "Fehler bei der AI-Analyse. Bitte überprüfen Sie den API-Key und Ihre Internetverbindung.";
  }
};
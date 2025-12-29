
import { GoogleGenAI, Chat, GenerateContentResponse } from "@google/genai";
import { Role, Message } from "../types";

const SYSTEM_INSTRUCTION = `
Contexto: Você é o MotoInvest AI, o mentor financeiro definitivo para motoboys.
Sua missão: Receber o valor do faturamento diário e dizer EXATAMENTE como o usuário deve dividir esse dinheiro AGORA para não ficar sem grana no fim do mês.

Diretrizes de Divisão Imediata (Para ganhos diários):
1. Combustível/Manutenção (Sugira 20-25%): Dinheiro para o dia seguinte.
2. Reserva de Emergência/Manutenção (Sugira 10%): Para pneus, óleo, imprevistos.
3. Pagamento de Dívidas/Contas (Sugira 30%): Focar no próximo vencimento.
4. Lucro Real/Pessoal (O que sobrar): O que ele pode gastar ou investir.

Formato de Resposta:
- Use uma tabela Markdown clara: "Divisão do Ganho de Hoje (R$ [VALOR])".
- Dê ordens claras: "Guarde R$ X para gasolina", "Separe R$ Y para o aluguel".
- Termine com uma frase motivadora curta.
- Sempre considere o contexto de renda variável.
`;

export class FinancialMentorService {
  private chat: Chat;

  // Use process.env.API_KEY directly as required by the Gemini API guidelines
  constructor() {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    this.chat = ai.chats.create({
      model: 'gemini-3-flash-preview',
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
      },
    });
  }

  async sendMessage(message: string): Promise<string> {
    try {
      const result = await this.chat.sendMessage({ message });
      return result.text || "Desculpe, tive um problema ao processar sua resposta.";
    } catch (error) {
      console.error("Gemini Error:", error);
      return "Erro de conexão com o mentor.";
    }
  }

  async *sendMessageStream(message: string) {
    try {
      const result = await this.chat.sendMessageStream({ message });
      for await (const chunk of result) {
        const c = chunk as GenerateContentResponse;
        yield c.text || "";
      }
    } catch (error) {
      console.error("Gemini Stream Error:", error);
      yield "Erro ao receber resposta.";
    }
  }
}

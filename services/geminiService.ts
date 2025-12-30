
import { GoogleGenAI, Chat, GenerateContentResponse, Type, FunctionDeclaration } from "@google/genai";
import { Role } from "../types";

const addBillDeclaration: FunctionDeclaration = {
  name: 'add_bill',
  parameters: {
    type: Type.OBJECT,
    description: 'Adiciona uma nova conta/boleto ao calendário financeiro do usuário.',
    properties: {
      name: { type: Type.STRING, description: 'Nome da conta (ex: Aluguel, Internet, MEI)' },
      amount: { type: Type.NUMBER, description: 'Valor da conta em Reais' },
      dueDate: { type: Type.STRING, description: 'Data de vencimento no formato YYYY-MM-DD' },
    },
    required: ['name', 'amount', 'dueDate'],
  },
};

const SYSTEM_INSTRUCTION = `
Contexto: Você é o MotoInvest AI, o mentor financeiro definitivo para motoboys.
Sua missão: Ajudar o motoboy a organizar ganhos e, agora, gerenciar o CALENDÁRIO de contas.

Habilidades Especiais:
1. Você pode ADICIONAR contas ao calendário usando a ferramenta 'add_bill'.
2. Se o usuário disser algo como "anota aí o aluguel de 600 reais pro dia 10", chame a função correspondente.
3. Sempre confirme após usar uma ferramenta.

Diretrizes de Divisão de Ganhos:
- Combustível (20-25%)
- Manutenção/Reserva (10%)
- Contas/Dívidas (30%)
- Lucro/Pessoal (Restante)

Formato: Use Markdown, tabelas para divisões de grana e seja direto, usando a gíria do corre de forma profissional.
`;

export class FinancialMentorService {
  private chat: Chat;

  constructor() {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    this.chat = ai.chats.create({
      model: 'gemini-3-flash-preview',
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        tools: [{ functionDeclarations: [addBillDeclaration] }],
      },
    });
  }

  async sendMessage(message: string): Promise<{ text: string; functionCalls?: any[] }> {
    try {
      const result = await this.chat.sendMessage({ message });
      return {
        text: result.text || "",
        functionCalls: result.functionCalls
      };
    } catch (error) {
      console.error("Gemini Error:", error);
      return { text: "Erro de conexão com o mentor." };
    }
  }

  async *sendMessageStream(message: string) {
    try {
      const result = await this.chat.sendMessageStream({ message });
      for await (const chunk of result) {
        const c = chunk as GenerateContentResponse;
        if (c.functionCalls) {
          yield { functionCalls: c.functionCalls };
        } else {
          yield { text: c.text || "" };
        }
      }
    } catch (error) {
      console.error("Gemini Stream Error:", error);
      yield { text: "Erro ao receber resposta." };
    }
  }
}

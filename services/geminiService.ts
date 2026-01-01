
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
Contexto: Você é o MotoInvest AI, o mentor financeiro definitivo para motoboys e trabalhadores autônomos.
Sua missão: Ajudar o usuário a organizar ganhos, gerenciar o CALENDÁRIO de contas e atingir METAS financeiras.

Foco em Metas:
- O usuário define um objetivo (ex: Comprar uma moto nova, Quitar dívida do Nubank).
- Ajude-o a ver quanto falta e como economizar nas diárias para chegar lá mais rápido.

Habilidades Especiais:
1. Você pode ADICIONAR contas ao calendário usando a ferramenta 'add_bill'.
2. Se o usuário disser "anota o boleto tal", use a função.

Diretrizes de Divisão de Lucro Sugerida:
- Reserva de Emergência/Meta (30%)
- Contas Fixas/Boletos (40%)
- Gastos Diários (30%)

Formato: Use Markdown, emojis de moto 🏍️ e dinheiro 💰. Seja motivador e direto.
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
}

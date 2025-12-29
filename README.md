
# MotoInvest AI 🏍️💰

O parceiro financeiro do motoboy. Organize suas diárias e saia das dívidas com inteligência artificial.

## 🚀 Como colocar no ar (Deploy)

Este app foi feito para rodar na **Vercel** ou **Netlify**.

### 1. Requisitos
Você precisará de:
- Uma conta no [Supabase](https://supabase.com) (Banco de Dados).
- Uma chave de API do [Google Gemini](https://ai.google.dev).

### 2. Configurando Variáveis de Ambiente
No painel da Vercel, adicione em **Settings > Environment Variables**:

| Nome | Valor |
|------|-------|
| `VITE_SUPABASE_URL` | Sua URL do Supabase |
| `VITE_SUPABASE_ANON_KEY` | Sua Chave Anon |
| `API_KEY` | Sua Chave do Gemini |

### 3. Instalando no Celular
1. Abra o link gerado pela Vercel no celular.
2. iPhone: Compartilhar > **Adicionar à Tela de Início**.
3. Android: Menu (3 pontos) > **Instalar Aplicativo**.

## 🛡️ Segurança
Não esqueça de ativar as **RLS (Row Level Security)** no Supabase para as tabelas `earnings`, `bills` e `chat_messages` usando a política `auth.uid() = user_id`.

---
Desenvolvido por Emerson JL.

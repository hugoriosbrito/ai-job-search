# Pipeline web do AI Job Search

Frontend local para visualizar e manusear o funil de candidaturas. O app foi
feito para ser uma camada visual sobre o workflow existente do repositório, sem
substituir `job_search_tracker.csv`, os arquivos em `documents/applications/` ou
as skills de busca, candidatura e entrevista.

## Rodar

Na pasta `web/`:

```powershell
npm install
npm run dev
```

O app abre em `http://localhost:4173`.

Para carregar o tracker local automaticamente, rode antes:

```powershell
npm run sync:tracker
npm run sync:documents
npm run dev
```

O arquivo gerado em `web/public/tracker.json` é ignorado pelo Git porque pode
conter dados pessoais de candidaturas. Também é possível usar **Importar
tracker** dentro da interface para escolher qualquer cópia do CSV.
Os PDFs gerados pelo fluxo também são publicados apenas localmente em
`web/public/documents/` e permanecem ignorados pelo Git. Para uma instalação
compartilhada, use arquivos redigidos ou substitua os exemplos sem incluir
dados pessoais.

## O que já está conectado

- Funil com Radar, Seleção, Candidatura, Entrevista, Oferta e Encerrada.
- Drag-and-drop com log de autoria: movimentações manuais aparecem como
  **Você** e ações executadas pela IA aparecem como **IA**.
- Persistência local no navegador para não perder movimentações durante o uso.
- Importação tolerante ao CSV atual do projeto, inclusive com o cabeçalho legado
  antes do cabeçalho moderno.
- Painel de contexto com as últimas movimentações do usuário, próximos passos e
  resumo de contagem por etapa.
- Contrato de ferramentas em `src/lib/agent-tools.ts`: leitura de contexto,
  criação, edição, prioridade, comentários, entrevista, movimentação e arquivo.

O comando `/kanban`, definido em `.claude/commands/kanban.md`, usa esse mesmo
contrato para o agente visualizar o funil, distinguir movimentações feitas por
**Você** das ações da **IA** e manter a próxima ação de cada candidatura em
contexto. A interface é a camada visual; o tracker e os arquivos de candidatura
continuam sendo a fonte canônica para fatos e resultados.

## Direção visual

A interface segue uma linguagem de produto dark e minimalista, com leitura
priorizada sobre decoração. O estudo de [Rare UI](https://www.rareui.com/),
[beUI](https://beui.dev/) e [Transitions.dev](https://transitions.dev/) orientou
os seguintes padrões:

- tabs com indicador curto, command palette e drawer para manter ações próximas
  do conteúdo;
- tool results e activity rows compactos para separar o que a IA executou do que
  o usuário fez;
- microtransições para contadores, abertura de painéis, toast e drag-and-drop,
  sempre com fallback para `prefers-reduced-motion`;
- contraste neutro, bordas finas e roxo pontual para estado/ação, sem transformar
  o kanban em um dashboard editorial ou em um mural de efeitos.

## Integração futura com o agente

As funções em `src/lib/agent-tools.ts` são a camada de domínio que o frontend
usa hoje. Um adaptador de backend pode chamar as mesmas ferramentas e persistir
as mutações no tracker/arquivos do projeto. O ponto importante é manter o
`Activity.actor` em cada mutação para que o agente nunca confunda uma decisão
dele com uma movimentação feita pelo usuário.

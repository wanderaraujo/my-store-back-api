# Changelog — My Store AI

Histórico de decisões e modificações do projeto.

---

## [0.1.0] — 2026-06-04

### Contexto
Início do projeto. Plataforma SaaS para pequenos negócios gerenciarem vendas, despesas e crescimento. Decisão de stack: **NestJS + MongoDB** no backend e **Vue 3 + Vite** no frontend, com autenticação via **Firebase Auth**.

---

### Backend — NestJS

#### Estrutura criada
```
backend/
└── src/
    ├── main.ts                          # Bootstrap: CORS, ValidationPipe, prefix api/v1, porta 3001
    ├── app.module.ts                    # Firebase Admin init + guards globais via APP_GUARD
    ├── auth/
    │   ├── auth.controller.ts           # POST /auth/login, /auth/register-business, GET /auth/profile
    │   ├── auth.service.ts
    │   ├── auth.module.ts
    │   └── dto/register-business.dto.ts
    ├── users/
    │   └── schemas/user.schema.ts       # Mongoose schema: firebaseUid, email, role, businessId
    ├── business/
    │   └── schemas/business.schema.ts   # Mongoose schema: name, logoUrl, businessType, city, currency
    └── common/
        ├── enums/role.enum.ts           # OWNER | GERENTE | CAIXA
        ├── decorators/
        │   ├── current-user.decorator.ts   # @CurrentUser() — injeta token decodificado do Firebase
        │   ├── roles.decorator.ts          # @Roles(Role.OWNER) — define roles exigidas na rota
        │   └── public.decorator.ts         # @Public() — desativa autenticação na rota
        └── guards/
            ├── firebase-auth.guard.ts      # Verifica JWT do Firebase globalmente em todas as rotas
            └── roles.guard.ts              # Bloqueia acesso com base no perfil do usuário
```

#### Dependências adicionadas
- `firebase-admin` — verificação do JWT emitido pelo Firebase no backend
- `@nestjs/mongoose` + `mongoose` — ORM para MongoDB
- `@nestjs/config` — leitura de variáveis de ambiente via `.env`
- `class-validator` + `class-transformer` — validação de DTOs

#### Decisões de arquitetura

**Autenticação global por padrão:**
`FirebaseAuthGuard` e `RolesGuard` são registrados como `APP_GUARD` no `AppModule`. Todas as rotas são protegidas por padrão. Use `@Public()` apenas para rotas verdadeiramente abertas.

**Firebase Admin inicializado no AppModule:**
O `admin.initializeApp()` é chamado no construtor do `AppModule`, lendo as credenciais da service account via variáveis de ambiente (`FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`).

**Custom Claims:**
Após o onboarding, o backend grava `role` e `businessId` como custom claims no token Firebase via `admin.auth().setCustomUserClaims()`. Isso permite que o frontend e futuras verificações de gateway leiam o perfil diretamente do token.

**Multi-tenant:**
Todo usuário está associado a um `businessId`. O campo existe no schema do `User` e é populado via Mongoose `.populate('businessId')` nas queries relevantes.

---

### Frontend — Vue 3 + Vite

#### Estrutura criada
```
frontend/
└── src/
    ├── App.vue                          # Apenas <RouterView /> — sem nav global
    ├── main.ts                          # createApp → Pinia → Router → mount
    ├── types/index.ts                   # Tipos: Role, AppUser, Business, RegisterBusinessPayload
    ├── services/
    │   ├── firebase.ts                  # loginWithGoogle, loginWithApple, loginWithEmail, logout, onAuthChange
    │   └── api.ts                       # Axios com interceptor JWT automático + retry no 401
    ├── stores/
    │   └── auth.ts                      # Pinia store: estado de auth, sync com backend, onboarding
    ├── router/
    │   └── index.ts                     # Guards: requiresAuth, requiresBusiness, rotas públicas
    └── views/
        ├── LoginView.vue                # Google + Apple + Email/Senha (toggle cadastro/login)
        ├── OnboardingView.vue           # Cadastro inicial do negócio (primeiro acesso)
        └── DashboardView.vue            # Estrutura base do dashboard pós-login
```

#### Dependências adicionadas
- `firebase` — autenticação client-side (Google, Apple, Email)
- `axios` — cliente HTTP com interceptores de token

#### Decisões de arquitetura

**Interceptor JWT automático (api.ts):**
Antes de cada requisição, o Axios busca o token atual do Firebase com `user.getIdToken()` e adiciona o header `Authorization: Bearer <token>`. Em caso de 401, força renovação com `getIdToken(true)` e reenvia a requisição uma vez.

**Auth store com `init()` idempotente (stores/auth.ts):**
O `init()` guarda a promise em `initPromise`. Chamadas repetidas retornam a mesma promise, evitando múltiplos listeners no `onAuthStateChanged` do Firebase.

**Sync explícito após login:**
Os métodos `signInWithGoogle`, `signInWithApple`, `signInWithEmail` e `signUpWithEmail` chamam `syncUserWithBackend()` diretamente após o login Firebase, antes de retornar. Isso garante que `appUser` (e `hasBusinessRegistered`) estejam corretos quando o `redirect()` do `LoginView` for executado. Sem isso, havia uma race condition onde o redirect acontecia antes do `onAuthStateChanged` terminar de sincronizar.

**Router guards (router/index.ts):**
- `requiresAuth: true` → redireciona para `/login` se não autenticado
- `requiresBusiness: true` → redireciona para `/onboarding` se sem negócio
- `meta.public` + autenticado → redireciona para `/onboarding` ou `/dashboard` conforme estado

---

### Bugs corrigidos

#### [Fix] Onboarding não redirecionava após cadastro
**Causa:** `AuthService.registerBusiness()` fazia `findByIdAndUpdate` mas retornava o objeto `user` capturado *antes* da atualização — sem `businessId`. O frontend recebia o usuário sem `businessId`, então `hasBusinessRegistered` continuava `false` e o router guard redirecionava de volta para o onboarding.

**Solução:** Adicionado `{ new: true }` no `findByIdAndUpdate` + `.populate('businessId')` para retornar o documento já atualizado.

```ts
// auth.service.ts
const updatedUser = await this.userModel
  .findByIdAndUpdate(user._id, { businessId: business._id }, { new: true })
  .populate('businessId')
  .exec()
```

#### [Fix] Usuário com negócio ia para onboarding ao fazer login
**Causa:** Race condition — o `redirect()` no `LoginView` era executado logo após o Firebase resolver o login, mas o `syncUserWithBackend()` (chamado pelo `onAuthStateChanged`) ainda não havia completado. `appUser` estava `null`, logo `hasBusinessRegistered` era `false`.

**Solução:** Os métodos de login no store aguardam o `syncUserWithBackend()` antes de retornar.

```ts
// stores/auth.ts
async function signInWithGoogle() {
  await loginWithGoogle()
  await syncUserWithBackend()  // garante appUser preenchido antes do redirect
}
```

---

### Variáveis de ambiente

**Backend** (`backend/.env`):
```
PORT=3001
MONGODB_URI=mongodb://localhost:27017/my_store_ai
FRONTEND_URL=http://localhost:5173
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=
```

**Frontend** (`frontend/.env`):
```
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_API_URL=http://localhost:3001/api/v1
```

---

### Como rodar

```bash
# Requisito: Node 22 (nvm use 22)

# Backend
cd backend
cp .env.example .env   # preencher com credenciais Firebase + MongoDB URI
npm run start:dev

# Frontend
cd frontend
cp .env.example .env   # preencher com credenciais Firebase
npm run dev
```

---

### Próximos passos planejados
- [x] Módulo de Produtos (CRUD com preços por canal: CAIXA, IFOOD, 99FOOD, UBER_EATS, DELIVERY_PROPRIO)
- [x] Módulo de Categorias
- [x] Sistema de PDV (carrinho + finalização de venda)
- [x] Dashboard com métricas (vendas do dia, ticket médio, canal principal)
- [ ] Módulo de Despesas
- [ ] Gestão de usuários por perfil (OWNER cria GERENTE e CAIXA)
- [ ] Relatórios e gráficos de evolução do negócio

---

## [0.2.0] — 2026-06-04

### Contexto
Implementação dos módulos de negócio core: cadastro de categorias e produtos, sistema de PDV com carrinho, finalização de vendas e dashboard com resumo do dia.

---

### Backend — Novos módulos

#### Estrutura adicionada
```
backend/src/
├── common/enums/
│   ├── sale-channel.enum.ts     # CAIXA | IFOOD | FOOD99 | UBER_EATS | DELIVERY_PROPRIO | WHATSAPP
│   └── payment-method.enum.ts  # DINHEIRO | PIX | CARTAO_CREDITO | CARTAO_DEBITO | FIADO
├── categories/
│   ├── schemas/category.schema.ts   # name, color, icon, businessId, isActive
│   ├── dto/create-category.dto.ts
│   ├── dto/update-category.dto.ts
│   ├── categories.service.ts        # CRUD filtrado por businessId
│   ├── categories.controller.ts     # GET/POST/PATCH/DELETE /categories
│   └── categories.module.ts
├── products/
│   ├── schemas/product.schema.ts    # name, sku, description, categoryId, prices (por canal), unit, stock
│   ├── dto/create-product.dto.ts
│   ├── dto/update-product.dto.ts
│   ├── products.service.ts          # CRUD + busca por texto e categoria
│   ├── products.controller.ts       # GET /products?search=&categoryId=, POST, PATCH, DELETE
│   └── products.module.ts
└── sales/
    ├── schemas/sale.schema.ts       # items (snapshot), total, channel, paymentMethod, status, userId
    ├── dto/create-sale.dto.ts
    ├── sales.service.ts             # create, findAll, findOne, cancel, getDaySummary
    ├── sales.controller.ts          # POST, GET, GET /summary/day, PATCH /:id/cancel
    └── sales.module.ts
```

#### Decisões de arquitetura

**Multi-tenant estrito:**
Todas as queries de categories, products e sales filtram por `businessId` extraído do token Firebase (`user.businessId` via custom claims). Nenhum registro de um negócio é acessível por outro.

**Preços por canal no produto:**
O schema `ProductPrices` armazena um preço para cada canal (`caixa`, `ifood`, `food99`, `uberEats`, `deliveryProprio`, `whatsapp`). Apenas `caixa` é obrigatório; os demais são opcionais. O PDV usa o preço do canal selecionado, com fallback para `caixa`.

**Snapshot de itens na venda:**
Os items da venda gravam `productName` e `unitPrice` no momento da venda, não apenas a referência ao produto. Isso garante histórico fiel mesmo se o produto for editado ou removido.

**Soft delete:**
Categorias e produtos nunca são deletados — recebem `isActive: false`. O endpoint DELETE faz um PATCH interno.

**Índices MongoDB:**
- `products`: índice composto `{ businessId, isActive }` + índice de texto em `name` e `description`
- `sales`: índice composto `{ businessId, createdAt: -1 }` + `{ businessId, channel }`

**getDaySummary:**
Calcula total, contagem e breakdown por canal das vendas do dia atual (00:00–23:59). Usado no dashboard sem paginação — opera sobre vendas do dia, volume baixo.

---

### Frontend — Novos módulos

#### Estrutura adicionada
```
frontend/src/
├── types/index.ts              # + Category, ProductPrices, Product, SaleChannel, PaymentMethod,
│                               #   SaleStatus, SaleItem, Sale, CartItem, DaySummary,
│                               #   SALE_CHANNEL_LABELS, PAYMENT_METHOD_LABELS
├── services/
│   ├── categories.ts           # CRUD /categories
│   ├── products.ts             # CRUD /products?search=&categoryId=
│   └── sales.ts                # create, getAll, cancel, getDaySummary
├── stores/
│   ├── categories.ts           # Pinia: lista, create, update, remove
│   ├── products.ts             # Pinia: lista com busca/filtro, create, update, remove
│   └── pdv.ts                  # Pinia: carrinho, canal, pagamento, checkout
└── views/
    ├── AppLayout.vue           # Layout com sidebar escura (nav: Dashboard, PDV, Produtos, Categorias)
    ├── DashboardView.vue       # Cards: vendas do dia, ticket médio, canal principal + barras por canal
    ├── CategoriesView.vue      # Grid de categorias com cor + ícone, modal criar/editar
    ├── ProductsView.vue        # Tabela com busca, filtro por categoria, preços multi-canal
    └── PDVView.vue             # Busca + lista de produtos + carrinho lateral + pagamento
```

#### PDV — fluxo de venda
1. Campo de busca com debounce (250ms) + chips de categoria filtrando produtos em tempo real
2. Seletor de canal no topo — ao trocar de canal, o carrinho é limpo e os preços são recalculados
3. Toque no produto → adiciona ao carrinho; controles `+`/`−` aparecem diretamente no card
4. Carrinho lateral: lista de itens com controles de quantidade, subtotal por item, total
5. Grid de formas de pagamento (Dinheiro, Pix, Cartão Crédito/Débito, Fiado) — seleção visual
6. "Cobrar R$ X,XX" finaliza a venda, exibe modal de confirmação e limpa o carrinho

#### Decisões de arquitetura

**Layout com AppLayout.vue:**
O router agrupa todas as rotas autenticadas sob um componente `AppLayout` que renderiza a sidebar + `<RouterView>`. As rotas `login` e `onboarding` ficam fora desse grupo e continuam sem layout.

**PDV store separado (pdv.ts):**
O carrinho vive no Pinia e persiste durante a sessão. `priceForChannel(product)` resolve o preço correto para o canal selecionado com fallback para `caixa`. O `checkout()` constrói o payload de venda (com snapshot dos nomes e preços) e limpa o carrinho após sucesso.

**`noUncheckedIndexedAccess` e Object.entries:**
O tsconfig tem `noUncheckedIndexedAccess: true`. `Object.entries(Record<string, number>)` retorna `[string, unknown][]` nesse modo — resolvido com cast explícito `as [string, number][]` em `channelEntries`.

---

### Próximos passos planejados
- [ ] Módulo de Despesas
- [ ] Gestão de usuários por perfil (OWNER cria GERENTE e CAIXA)
- [ ] Relatórios e gráficos de evolução do negócio

---

## [0.3.0] — 2026-06-04

### Contexto
Correção do decremento de estoque ao realizar vendas e implementação da tela de histórico de vendas com filtros.

---

### Backend — Correções

#### [Fix] Estoque não decrementava ao finalizar venda
**Causa:** `SalesService.create` criava o documento de venda mas não atualizava o campo `stock` dos produtos vendidos.

**Solução:** Após criar a venda, executa um `bulkWrite` no model de `Product`, decrementando `stock` de cada item via `$inc`. O filtro `stock: { $gte: 0 }` garante que produtos com `stock: -1` (estoque ilimitado) não sejam afetados.

```ts
// sales.service.ts
await this.productModel.bulkWrite(
  items.map((item) => ({
    updateOne: {
      filter: { _id: item.productId, businessId, stock: { $gte: 0 } },
      update: { $inc: { stock: -item.quantity } },
    },
  })),
)
```

**Arquivos alterados:**
- `sales/sales.module.ts` — registra `Product` no `MongooseModule.forFeature`
- `sales/sales.service.ts` — injeta `productModel` e executa o `bulkWrite` após criar a venda

---

### Frontend — Novo módulo

#### Tela de Vendas (`SalesView.vue`)

Nova rota `/sales` acessível pelo menu lateral (sidebar + bottom nav mobile).

**Funcionalidades:**
- Tabela de vendas com colunas: Data, Canal, Pagamento, Itens, Total, Status, Operador
- Clique em qualquer linha abre modal de detalhe com: canal, pagamento, operador, observações e tabela de itens (produto, qtd, preço unit., subtotal e total)
- Botão "Cancelar venda" no modal com confirmação em segundo modal (avisa que estoque não é revertido)
- Vendas canceladas aparecem com `opacity: 0.55` na tabela

**Filtros (client-side sobre as 200 vendas carregadas):**
- **Data inicial / Data final** — range de datas com cobertura do dia completo (00:00–23:59)
- **Operador** — dropdown populado dinamicamente com os operadores únicos das vendas
- **Status** — chips de Todos / Concluídas / Pendentes / Canceladas (cor do chip combina com o badge de status)
- Botão "Limpar filtros" aparece apenas quando há filtro ativo
- Todos os filtros são combinados (AND)

**Correção visual:**
- Coluna Data estava com cor `#64748b` (apagada) — corrigido para `#1e293b; font-weight: 500` no desktop e `font-weight: 600; color: #1e293b` nos cards mobile

**Arquivos alterados:**
- `views/SalesView.vue` — criado
- `router/index.ts` — rota `sales` adicionada ao grupo autenticado
- `views/AppLayout.vue` — item "Vendas" (📋) adicionado na sidebar e no bottom nav mobile

---

### Próximos passos planejados
- [ ] Módulo de Despesas
- [ ] Gestão de usuários por perfil (OWNER cria GERENTE e CAIXA)
- [ ] Relatórios e gráficos de evolução do negócio

---

## [0.4.0] — 2026-06-05

### Contexto
Reestruturação do cadastro de produtos com preço de custo, cálculo automático de lucro por venda, e reformulação dos preços por canal (estrutura com `value`/`active` por canal, canais restritos a CAIXA, IFOOD, FOOD99, DELIVERY_PROPRIO).

---

### Backend

#### Preço de custo no produto
- `product.schema.ts` — adicionado campo `costPrice: number` (min: 0, default: 0)
- `create-product.dto.ts` / `update-product.dto.ts` — campo `costPrice` opcional incluído

#### Reestruturação de preços por canal
Preços migraram de um número simples por canal para um objeto `{ value, active }`:

```ts
// Antes
prices: { caixa: 9, ifood: 10 }

// Depois
prices: {
  caixa:           { value: 9,  active: true  },
  ifood:           { value: 10, active: true  },
  food99:          { value: 0,  active: false },
  deliveryProprio: { value: 0,  active: false },
}
```

Isso permite saber quais canais cada produto está disponível, sem remover os inativos.

- `product.schema.ts` — novo sub-schema `ChannelPrice { value, active }` usado em todos os canais
- `create-product.dto.ts` / `update-product.dto.ts` — `ChannelPriceDto` com validação de `value` (number ≥ 0) e `active` (boolean)

#### Canais removidos
`UBER_EATS` e `WHATSAPP` removidos de `sale-channel.enum.ts`, do schema de produto e dos DTOs. Canais ativos: **CAIXA, IFOOD, FOOD99, DELIVERY_PROPRIO**.

#### Lucro calculado no servidor ao criar venda
`SalesService.create` agora:
1. Busca `costPrice` de cada produto no banco (não confia no frontend)
2. Calcula `profit = (unitPrice − costPrice) × quantity` por item
3. Persiste `costPrice` e `profit` em cada `SaleItem`
4. Persiste `totalProfit` na `Sale`

```ts
// sales.service.ts
const costMap = new Map<string, number>(
  products.map((p): [string, number] => [String(p._id), Number(p.costPrice ?? 0)]),
)
const items = rawItems.map((item) => {
  const costPrice: number = costMap.get(String(item.productId)) ?? 0
  const profit: number    = (item.unitPrice - costPrice) * item.quantity
  return { ...item, costPrice, profit }
})
const totalProfit = items.reduce((sum, i) => sum + i.profit, 0)
```

- `sale.schema.ts` — `SaleItem` ganhou `costPrice` e `profit`; `Sale` ganhou `totalProfit`

---

### Frontend

#### Tipos atualizados (`types/index.ts`)
- Nova interface `ChannelPrice { value: number; active: boolean }`
- `ProductPrices` atualizado para usar `ChannelPrice` em todos os campos
- `SaleChannel` e `SALE_CHANNEL_LABELS` removeram `UBER_EATS` e `WHATSAPP`
- `SaleItem` ganhou `costPrice` e `profit`; `Sale` ganhou `totalProfit`
- `Product` ganhou `costPrice?: number`

#### PDV store (`stores/pdv.ts`)
`priceForChannel` atualizado para ler `prices[ch].value` e verificar `prices[ch].active`:

```ts
if (ch === 'IFOOD' && prices.ifood?.active) return prices.ifood.value
```

#### Tela de Produtos (`ProductsView.vue`)
- **Formulário reestruturado:** canais de venda aparecem primeiro, custo unitário em seção separada abaixo
- **Layout de canais:** 1 linha por canal com logo da plataforma, toggle on/off e input de preço
  - Canal **Caixa** sem toggle — sempre ativo, badge "Padrão", valor pode ser 0
  - Canais inativos ficam com opacidade reduzida e input desabilitado
- **Logos dos canais** em `/public/channels/`
- **Layout do formulário:** Categoria em linha própria; Unidade e Estoque na linha abaixo
- **Mobile:** channel rows compactas em linha única — logo 28px, toggle menor (34×19px), prefixo "R$" oculto, input 76px

#### Assets criados
```
frontend/public/channels/
├── caixa.svg             # Logo oficial fornecido
├── ifood.svg             # SVG gerado (wordmark vermelho)
├── 99food.svg            # SVG gerado (fundo amarelo, tipografia bold)
└── delivery-proprio.svg  # Logo oficial fornecido (globo azul)
```

---

### Próximos passos planejados
- [ ] Exibir lucro por venda em SalesView e lucro do dia no Dashboard
- [ ] Módulo de Despesas
- [x] Gestão de usuários por perfil (OWNER cria GERENTE e CAIXA)
- [ ] Relatórios e gráficos de evolução do negócio

---

## [0.5.0] — 2026-06-05

### Contexto
Gestão de equipe, sistema de permissões configuráveis por perfil e controle de acesso por papel (RBAC) em rotas e menus.

---

### Backend

#### Gestão de usuários (`UsersModule`)

Novo módulo `backend/src/users/` com endpoints restritos a `OWNER`:

| Endpoint | Descrição |
|---|---|
| `GET /users` | Lista todos os usuários do negócio |
| `POST /users/invite` | Cria convite pendente (sem `firebaseUid`) |
| `PATCH /users/:id` | Atualiza papel e/ou status de ativação |
| `DELETE /users/:id` | Desativa o usuário (soft) |
| `PATCH /users/:id/reactivate` | Reativa usuário desativado |

**Fluxo de convite:**
O OWNER cadastra nome + e-mail + papel. O registro fica com `isPending: true` e sem `firebaseUid`. Quando o convidado faz login pela primeira vez, o `AuthService.getOrCreateUser` detecta o convite pelo e-mail, vincula o `firebaseUid`, ativa o usuário e chama `setCustomClaims` com o papel e `businessId` corretos.

#### Alterações no `User` schema
- `firebaseUid`: removido `required: true`, adicionado índice `sparse: true` — permite múltiplos registros sem UID (convites pendentes) sem violar a constraint de unicidade
- Novo campo `isPending: boolean` (default `false`) — distingue convites aguardando acesso de usuários ativos ou desativados deliberadamente

#### Permissões configuráveis por perfil (`BusinessModule`)

Novo módulo `backend/src/business/` com:

| Endpoint | Papel | Descrição |
|---|---|---|
| `GET /business/permissions` | OWNER | Lê as permissões brutas de GERENTE e CAIXA |
| `PATCH /business/permissions` | OWNER | Atualiza permissões de GERENTE e/ou CAIXA |
| `GET /business/effective-permissions` | Todos | Retorna mapa plano de booleans para o papel do usuário logado |

**`business.schema.ts`** ganhou campo `permissions: BusinessPermissions` com defaults sensatos:

```ts
// Permissões do GERENTE (padrão)
canViewSales: true, canCancelSales: false, canApplyDiscounts: true,
canEditProducts: true, canChangePrices: false, canManageStock: true,
canViewFinancialReports: false, canManageUsers: false

// Permissões do CAIXA (padrão)
canViewProducts: true, canViewCategories: true, canApplyDiscounts: false,
canCancelSales: false, canRefund: false, canSellWithNegativeStock: false, canViewStock: false
```

**`getEffectivePermissions(businessId, role)`** — retorna um `EffectivePermissions` (union plana de todas as chaves). OWNER recebe tudo `true`; GERENTE recebe suas permissões configuradas + `canViewProducts/canViewCategories` sempre `true`; CAIXA recebe suas permissões configuradas.

#### Restrições de acesso em Sales
- `GET /sales` e `GET /sales/:id` — agora exigem papel `OWNER` ou `GERENTE` (`@Roles`)
- `PATCH /sales/:id/cancel` — idem
- `SalesService.findAll` aceita `role` como parâmetro: quando `GERENTE`, aplica filtro automático `createdAt: { $gte: hoje 00:00, $lte: hoje 23:59 }` — o gerente só consulta vendas do dia

---

### Frontend

#### Tela de Equipe (`UsersView.vue`)
Nova rota `/users` (visível apenas para OWNER).

- Cards de resumo: Ativos / Aguardando acesso / Inativos
- Tabela com avatar, nome/e-mail, badge de papel, badge de status e ações
- **Modal Convidar:** nome, e-mail e papel (GERENTE ou CAIXA)
- **Modal Editar:** troca de papel com validação
- **Modal Confirmar desativação:** avisa que o acesso será bloqueado imediatamente
- Botão reativar para usuários inativos
- OWNER não pode ser editado nem desativado (proteção no backend e frontend)

#### Tela de Atribuições (`PermissionsView.vue`)
Nova rota `/permissions` (visível apenas para OWNER).

- Dois cards lado a lado: **Gerente** e **Caixa**
- Toggle switches para cada permissão com label e descrição
- Botão "Salvar alterações" com feedback de sucesso inline
- Mobile: cards empilhados em coluna única

#### Auth store — `effectivePermissions`
Após cada login bem-sucedido com `businessId`, o store busca `GET /business/effective-permissions` e armazena em `effectivePermissions`. Esse estado é usado em tempo real por AppLayout e pelo router guard para decidir quais menus e rotas estão disponíveis.

#### Controle de acesso em AppLayout
Função `canView(permission)`: retorna `true` para OWNER/GERENTE; para CAIXA, consulta `effectivePermissions`.

| Menu | OWNER | GERENTE | CAIXA |
|---|---|---|---|
| Dashboard | ✅ | ❌ | ❌ |
| PDV | ✅ | ✅ | ✅ |
| Produtos | ✅ | ✅ | Configurável |
| Categorias | ✅ | ✅ | Configurável |
| Vendas | ✅ | ✅ | ❌ |
| Equipe | ✅ | ❌ | ❌ |
| Atribuições | ✅ | ❌ | ❌ |

#### Router guards
- `requiresRole` — aceita string ou array de papéis; bloqueia acesso e redireciona para a home do papel
- `requiresPermission` — verificado apenas para CAIXA; se a permissão estiver desativada, redireciona para `/pdv`
- `roleHome(role)` — OWNER → `dashboard`, GERENTE → `sales`, CAIXA → `pdv`

`SalesView`: quando `isGerente`, oculta os filtros de data e operador (o backend já limita ao dia) e exibe subtítulo "Vendas de hoje".

---

### Bugs corrigidos

#### [Fix] Usuário convidado não via produtos após aceitar convite
**Causa:** O backend chama `setCustomClaims` durante o `POST /auth/login` do usuário convidado. Porém o token Firebase no cliente era o token emitido *antes* das claims serem gravadas — sem `businessId`. Todas as chamadas subsequentes (produtos, PDV) chegavam no backend com `user.businessId = undefined`, retornando listas vazias sem erro.

**Solução:** Em `syncUserWithBackend` e `registerBusiness`, após receber o `appUser` com `businessId`, força `firebaseUser.getIdToken(true)` para invalidar o cache e obter um token novo com as claims atualizadas.

```ts
// stores/auth.ts
if (data.businessId && firebaseUser.value) {
  await firebaseUser.value.getIdToken(true)   // força token com custom claims
  const { data: perms } = await businessService.getEffectivePermissions()
  effectivePermissions.value = perms
}
```

---

### Arquivos criados
```
backend/src/
├── users/
│   ├── dto/invite-user.dto.ts
│   ├── dto/update-user.dto.ts
│   ├── users.service.ts
│   ├── users.controller.ts
│   └── users.module.ts
└── business/
    ├── dto/update-permissions.dto.ts
    ├── business.service.ts
    ├── business.controller.ts
    └── business.module.ts

frontend/src/
├── services/
│   ├── users.ts
│   └── business.ts
└── views/
    ├── UsersView.vue
    └── PermissionsView.vue
```

---

### Próximos passos planejados
- [ ] Exibir lucro por venda em SalesView e lucro do dia no Dashboard
- [ ] Módulo de Despesas
- [ ] Relatórios e gráficos de evolução do negócio

---

## [0.7.0] — 2026-06-09

### Contexto
Quatro frentes em paralelo: deploy do backend como **Firebase Function v2**, módulo completo de **movimentações de estoque** com ajuste manual, upload de imagens de produtos e avatares via **Firebase Storage**, e correções de confiabilidade (custom claims, normalização de e-mail, guard de sessão).

---

### Backend

#### Deploy como Firebase Function v2
`AppModule` não sobe mais como processo autônomo em produção — o entry point virou uma Cloud Function exportada:

```ts
// src/main.firebase.ts
export const api = onRequest(
  { region: 'southamerica-east1', memory: '512MiB', timeoutSeconds: 60 },
  ...
)
```

- `NestFactory.create` usa `ExpressAdapter` para compatibilidade com o runtime do Cloud Run (Firebase Functions v2)
- Bootstrap é **idempotente** (`isInitialized` flag) — evita re-inicialização em cold starts frequentes
- `firebase.json` e `.firebaserc` adicionados para deploy via `firebase deploy --only functions`
- CORS origin padrão atualizado para `https://my-store-prd.web.app`

**Firebase Admin init (`backend/src/firebase.ts`):**
- Detecta ambiente Cloud Run via `process.env.K_SERVICE` — chama `admin.initializeApp()` sem credenciais (o runtime fornece automaticamente)
- Em desenvolvimento (sem `K_SERVICE`) continua usando service account via `.env`

---

#### Módulo de Movimentações de Estoque (`StockMovementsModule`)

Novo módulo `backend/src/stock-movements/` com rastreamento completo do histórico de estoque.

**Schema `StockMovement`:**

| Campo | Tipo | Descrição |
|---|---|---|
| `productId` | ObjectId | Produto afetado |
| `productName` | string | Snapshot do nome |
| `businessId` | ObjectId | Tenant |
| `userId` | ObjectId | Operador |
| `type` | `MovementType` | Tipo da movimentação |
| `quantity` | number | Quantidade movida |
| `reason` | string? | Motivo |
| `previousStock` | number | Estoque antes |
| `newStock` | number | Estoque depois |
| `saleId` | ObjectId? | Venda relacionada |

`MovementType`: `entrada | saida | desperdicio | ajuste | venda | cancelamento`

Índices: `{ businessId, createdAt: -1 }` e `{ productId, createdAt: -1 }`

**Endpoints:**

| Endpoint | Descrição |
|---|---|
| `POST /stock-movements` | Ajuste manual (OWNER / GERENTE) |
| `GET /stock-movements?productId=&page=` | Histórico paginado |

**Integração com vendas (`SalesService`):**
Ao criar uma venda, o `SalesService` chama `stockMovementsService.recordSaleMovement` para cada item com estoque controlado (`stock ≥ 0`). Produtos com `stock = -1` (ilimitado) não geram movimentação.

---

#### Firebase Storage — Upload de Imagens (`StorageModule`)

Novo módulo `backend/src/storage/` usando `firebase-admin` + `sharp` para processamento.

**`StorageService`:**

| Método | Processamento | Path no bucket |
|---|---|---|
| `uploadProductImage` | 800×800 inside, WebP quality 75 | `business/{businessId}/products/{productId}.webp` |
| `uploadUserAvatar` | 256×256 cover, WebP quality 85 | `business/{businessId}/users/{userId}.webp` |

- Arquivos são tornados públicos no GCS e servidos via `https://storage.googleapis.com/{bucket}/...`
- `cacheControl: public, max-age=31536000` (1 ano de cache no CDN)
- Validação de mimetype antes do upload (apenas `image/*`)

**Endpoint de imagem de produto:**
`POST /products/:id/image` — `FileInterceptor` (multer), limite de 5MB, validação de mimetype. Atualiza `product.imageUrl` após upload.

**Endpoint de avatar de usuário:**
`POST /users/:id/avatar` — upload de avatar, atualiza `photoURL` no Firebase Auth (`admin.auth().updateUser`) e no MongoDB.

**Dependências adicionadas:** `multer`, `@nestjs/platform-express`, `sharp`

---

#### Guard de sessão desatualizada (`FirebaseAuthGuard`)

Tokens sem `businessId` nas custom claims agora são rejeitados com `401 Unauthorized` e mensagem `"Sessão desatualizada — faça login novamente"`. Exceção: rotas sob `/api/v1/auth/` (setup inicial do usuário não tem claims ainda).

```ts
if (!isPublic && !isAuthRoute && !decoded.businessId) {
  throw new UnauthorizedException('Sessão desatualizada — faça login novamente')
}
```

#### Script de backfill de claims (`backend/scripts/fix-claims.ts`)
Utilitário para corrigir `role` e `businessId` nas custom claims de usuários cadastrados antes da nova lógica. Execução manual via `npx ts-node scripts/fix-claims.ts`.

---

#### Normalização de e-mail

`auth.service.ts` e `users.service.ts` normalizam e-mails para **lowercase** em:
- Login (`POST /auth/login`)
- Cadastro de negócio
- Convite de usuário (`POST /users/invite`)
- Busca por e-mail ao vincular convite

Evita colisões entre `Usuario@gmail.com` e `usuario@gmail.com`.

---

### Frontend

#### Tipos adicionados (`types/index.ts`)
- `MovementType` union type
- `StockMovement` / `StockMovementsPage` interfaces
- `MOVEMENT_TYPE_LABELS` — labels pt-BR por tipo
- `MOVEMENT_TYPE_COLORS` — cor hex por tipo (verde=entrada, vermelho=desperdício, azul=venda, etc.)

#### Service de movimentações (`services/stock-movements.ts`)
- `getByProduct(productId, page)` — histórico paginado por produto
- `createManual(dto)` — ajuste manual

#### `ProductsView.vue` — reestruturação major
- **Coluna de imagem:** cada linha da tabela exibe o thumbnail do produto (ou ícone placeholder)
- **Upload de imagem:** botão na linha ou no modal de edição; preview da imagem atual; input `type=file` oculto com validação de tipo e tamanho (≤5MB)
- **Botão de histórico de estoque:** abre painel lateral com histórico paginado de movimentações, exibindo tipo (badge colorido), quantidade, operador, motivo e data
- **Modal de ajuste manual:** seleciona tipo (entrada/saída/desperdício/ajuste), quantidade e motivo opcional; reflete o novo estoque em tempo real no campo

#### `UsersView.vue` — avatar
- Área de avatar clicável em cada card de usuário abre seletor de arquivo
- Preview imediato após upload; fallback para iniciais do nome

#### `stores/auth.ts` — refresh de token pós-sync
Após `syncUserWithBackend` retornar `appUser` com `businessId`, força `getIdToken(true)` antes de buscar `effectivePermissions`. Garante que o token usado nas chamadas subsequentes já carrega as custom claims atualizadas.

#### `ReportsView.vue` — correções de acesso seguro
- `topProducts[0]?.totalRevenue ?? 0` — evita crash quando a lista está vazia
- `channels[0]?.revenue ?? 0` — idem para canais
- `period.split('-') as [string, string]` — satisfaz `noUncheckedIndexedAccess`

---

### Arquivos criados
```
backend/src/
├── firebase.ts                              # Firebase Admin init isolado
├── storage/
│   ├── storage.module.ts
│   └── storage.service.ts                   # uploadProductImage + uploadUserAvatar (sharp + GCS)
└── stock-movements/
    ├── dto/create-stock-movement.dto.ts
    ├── schemas/stock-movement.schema.ts
    ├── stock-movements.controller.ts
    ├── stock-movements.module.ts
    └── stock-movements.service.ts

backend/scripts/
└── fix-claims.ts                            # Backfill de custom claims Firebase

frontend/src/
└── services/
    └── stock-movements.ts
```

---

### Variáveis de ambiente adicionadas

**Backend** (`backend/.env`):
```
FIREBASE_STORAGE_BUCKET=your-project.appspot.com
```

---

### Próximos passos planejados
- [ ] Exibir lucro por venda em SalesView e lucro do dia no Dashboard
- [ ] Módulo de Despesas
- [ ] Relatórios e gráficos de evolução do negócio

---

## [0.6.0] — 2026-06-06

### Contexto
Implementação do módulo de **Fechamento de Caixa** por operador — relatório em formato de cupom fiscal exibido dentro da tela de Vendas, com breakdown por canal de venda e forma de pagamento.

---

### Backend

#### Novo endpoint `GET /sales/summary/operator-close`
Acessível a todos os papéis autenticados (OWNER, GERENTE).

- Filtra vendas **concluídas** do operador logado no período informado (`dateFrom`, `dateTo`)
- OWNER e GERENTE podem passar `operatorId` opcional para fechar o caixa de outro operador
- Retorna via agregação MongoDB `$facet`:
  - `totalSales` — número de vendas concluídas
  - `totalItems` — soma de todas as quantidades de itens (`$sum: { $sum: '$items.quantity' }`)
  - `grandTotal` — faturamento total
  - `byChannel` — array de canais, cada um com `total`, `count` e `byPaymentMethod` aninhado

**Agregação em dois estágios por canal:**
```ts
// 1º group: agrupa por { channel, paymentMethod }
// 2º group: agrupa por channel, empurrando paymentMethod como array aninhado
byChannel: [
  { $group: { _id: { channel, paymentMethod }, pmTotal, pmCount } },
  { $group: { _id: channel, total, count, byPaymentMethod: [ { paymentMethod, total } ] } },
  { $sort: { total: -1 } },
]
```

- `operatorName` é resolvido buscando o usuário pelo `firebaseUid` (ou pelo `targetUserId` quando OWNER/GERENTE passa `operatorId`)

**Arquivos alterados:**
- `sales/sales.service.ts` — novo método `getOperatorCashClose`
- `sales/sales.controller.ts` — novo endpoint `GET /sales/summary/operator-close`

#### Endpoint `GET /sales/summary/cashclose` mantido
Endpoint analítico existente (OWNER apenas) com breakdown por canal, pagamento e todos os operadores — mantido para uso futuro em relatórios gerenciais.

---

### Frontend

#### Filtros de data e operador unificados para OWNER e GERENTE
A `filter-row` agora é exibida para **todos os papéis**:
- OWNER: sem restrição de datas; vê filtro de operador
- GERENTE: datas restritas a `min = hoje − 2 dias` e `max = hoje` via atributos HTML `min`/`max`; também vê filtro de operador
- Operadores são carregados no `onMounted` independente do papel

#### Botão "Fechamento de caixa"
Posicionado ao final da `filter-row` (ao lado dos filtros já preenchidos). Ao clicar:
1. Usa `filterDateFrom`, `filterDateTo` e `filterOperator` já selecionados — sem necessidade de reentrar o período
2. Abre o modal e carrega o recibo automaticamente

#### Modal — recibo estilo cupom térmico
```
      NOME DA LOJA
  FECHAMENTO DE CAIXA
══════════════════════
Operador       João Silva
Período    01/06 a 06/06
Emissão    06/06 23:59
Vendas realizadas    12
Total de itens       38
──────────────────────
IFOOD
  PIX          R$ 450,00
  Total        R$ 450,00
──────────────────────
CAIXA
  Dinheiro     R$ 800,00
  Cartão Déb.  R$ 200,00
  Total      R$ 1.000,00
══════════════════════
Total em Dinheiro    R$ 800,00
══════════════════════
TOTAL FECHAMENTO  R$ 1.450,00
══════════════════════
        Obrigado!

[🖨 Imprimir]
```

- **Por canal:** cada canal exibe suas formas de pagamento com valores e um subtotal
- **Total em Dinheiro:** soma do DINHEIRO em todos os canais (destaque para conferência do caixa físico)
- **Botão Imprimir** ao final do recibo com ícone SVG de impressora
- **Print via popup:** `window.open()` injeta o HTML do `#receipt` com estilos inline — imprime apenas o recibo, sem a página inteira

#### Tipos adicionados (`types/index.ts`)
- `OperatorCashCloseChannel` — `{ channel, total, count, byPaymentMethod[] }`
- `OperatorCashClose` — `{ operatorName, totalSales, totalItems, grandTotal, byChannel[] }`
- `CashCloseSummary` e `CashCloseOperator` mantidos para uso futuro

#### Service atualizado (`services/sales.ts`)
- Novo método `getOperatorCashClose(params: { dateFrom?, dateTo?, operatorId? })`

---

### Próximos passos planejados
- [ ] Exibir lucro por venda em SalesView e lucro do dia no Dashboard
- [ ] Módulo de Despesas
- [ ] Relatórios e gráficos de evolução do negócio

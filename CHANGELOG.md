# Changelog — My Store AI (Backend)

Histórico de decisões e modificações do backend (NestJS + MongoDB + Firebase).

> Este changelog foi separado do changelog combinado (que continha back e front juntos). A versão com o histórico completo de frontend está em `frontend/CHANGELOG.md`.

---

## [0.1.0] — 2026-06-04

### Contexto
Início do projeto. Plataforma SaaS para pequenos negócios gerenciarem vendas, despesas e crescimento. Decisão de stack: **NestJS + MongoDB** no backend, autenticação via **Firebase Auth**.

### Estrutura criada
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

### Dependências adicionadas
- `firebase-admin` — verificação do JWT emitido pelo Firebase no backend
- `@nestjs/mongoose` + `mongoose` — ORM para MongoDB
- `@nestjs/config` — leitura de variáveis de ambiente via `.env`
- `class-validator` + `class-transformer` — validação de DTOs

### Decisões de arquitetura

**Autenticação global por padrão:**
`FirebaseAuthGuard` e `RolesGuard` são registrados como `APP_GUARD` no `AppModule`. Todas as rotas são protegidas por padrão. Use `@Public()` apenas para rotas verdadeiramente abertas.

**Firebase Admin inicializado no AppModule:**
O `admin.initializeApp()` é chamado no construtor do `AppModule`, lendo as credenciais da service account via variáveis de ambiente (`FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`).

**Custom Claims:**
Após o onboarding, o backend grava `role` e `businessId` como custom claims no token Firebase via `admin.auth().setCustomUserClaims()`. Isso permite que o frontend e futuras verificações de gateway leiam o perfil diretamente do token.

**Multi-tenant:**
Todo usuário está associado a um `businessId`. O campo existe no schema do `User` e é populado via Mongoose `.populate('businessId')` nas queries relevantes.

### Bugs corrigidos

#### [Fix] Onboarding não redirecionava após cadastro
**Causa:** `AuthService.registerBusiness()` fazia `findByIdAndUpdate` mas retornava o objeto `user` capturado *antes* da atualização — sem `businessId`. O frontend recebia o usuário sem `businessId`, então o router guard redirecionava de volta para o onboarding.

**Solução:** Adicionado `{ new: true }` no `findByIdAndUpdate` + `.populate('businessId')` para retornar o documento já atualizado.

```ts
// auth.service.ts
const updatedUser = await this.userModel
  .findByIdAndUpdate(user._id, { businessId: business._id }, { new: true })
  .populate('businessId')
  .exec()
```

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

### Como rodar
```bash
# Requisito: Node 22 (nvm use 22)

cd backend
cp .env.example .env   # preencher com credenciais Firebase + MongoDB URI
npm run start:dev
```

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

### Novos módulos

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

### Decisões de arquitetura

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

### Próximos passos planejados
- [ ] Módulo de Despesas
- [ ] Gestão de usuários por perfil (OWNER cria GERENTE e CAIXA)
- [ ] Relatórios e gráficos de evolução do negócio

---

## [0.3.0] — 2026-06-04

### Contexto
Correção do decremento de estoque ao realizar vendas e implementação da tela de histórico de vendas com filtros.

### Correções

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

### Próximos passos planejados
- [ ] Módulo de Despesas
- [ ] Gestão de usuários por perfil (OWNER cria GERENTE e CAIXA)
- [ ] Relatórios e gráficos de evolução do negócio

---

## [0.4.0] — 2026-06-05

### Contexto
Reestruturação do cadastro de produtos com preço de custo, cálculo automático de lucro por venda, e reformulação dos preços por canal (estrutura com `value`/`active` por canal, canais restritos a CAIXA, IFOOD, FOOD99, DELIVERY_PROPRIO).

### Preço de custo no produto
- `product.schema.ts` — adicionado campo `costPrice: number` (min: 0, default: 0)
- `create-product.dto.ts` / `update-product.dto.ts` — campo `costPrice` opcional incluído

### Reestruturação de preços por canal
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

### Canais removidos
`UBER_EATS` e `WHATSAPP` removidos de `sale-channel.enum.ts`, do schema de produto e dos DTOs. Canais ativos: **CAIXA, IFOOD, FOOD99, DELIVERY_PROPRIO**.

### Lucro calculado no servidor ao criar venda
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

### Próximos passos planejados
- [ ] Exibir lucro por venda em SalesView e lucro do dia no Dashboard
- [ ] Módulo de Despesas
- [x] Gestão de usuários por perfil (OWNER cria GERENTE e CAIXA)
- [ ] Relatórios e gráficos de evolução do negócio

---

## [0.5.0] — 2026-06-05

### Contexto
Gestão de equipe, sistema de permissões configuráveis por perfil e controle de acesso por papel (RBAC) em rotas.

### Gestão de usuários (`UsersModule`)

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

### Alterações no `User` schema
- `firebaseUid`: removido `required: true`, adicionado índice `sparse: true` — permite múltiplos registros sem UID (convites pendentes) sem violar a constraint de unicidade
- Novo campo `isPending: boolean` (default `false`) — distingue convites aguardando acesso de usuários ativos ou desativados deliberadamente

### Permissões configuráveis por perfil (`BusinessModule`)

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

### Restrições de acesso em Sales
- `GET /sales` e `GET /sales/:id` — agora exigem papel `OWNER` ou `GERENTE` (`@Roles`)
- `PATCH /sales/:id/cancel` — idem
- `SalesService.findAll` aceita `role` como parâmetro: quando `GERENTE`, aplica filtro automático `createdAt: { $gte: hoje 00:00, $lte: hoje 23:59 }` — o gerente só consulta vendas do dia

### Bugs corrigidos

#### [Fix] Usuário convidado não via produtos após aceitar convite
**Causa:** O backend chama `setCustomClaims` durante o `POST /auth/login` do usuário convidado. Porém o token Firebase no cliente era o token emitido *antes* das claims serem gravadas — sem `businessId`. Todas as chamadas subsequentes (produtos, PDV) chegavam no backend com `user.businessId = undefined`, retornando listas vazias sem erro.

**Solução (frontend):** ver `frontend/CHANGELOG.md` — o fix efetivo foi aplicado em `stores/auth.ts`, forçando `getIdToken(true)` após o backend gravar as claims.

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
```

### Próximos passos planejados
- [ ] Exibir lucro por venda em SalesView e lucro do dia no Dashboard
- [ ] Módulo de Despesas
- [ ] Relatórios e gráficos de evolução do negócio

---

## [0.6.0] — 2026-06-06

### Contexto
Implementação do módulo de **Fechamento de Caixa** por operador — relatório em formato de cupom fiscal, com breakdown por canal de venda e forma de pagamento.

### Novo endpoint `GET /sales/summary/operator-close`
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

### Endpoint `GET /sales/summary/cashclose` mantido
Endpoint analítico existente (OWNER apenas) com breakdown por canal, pagamento e todos os operadores — mantido para uso futuro em relatórios gerenciais.

### Próximos passos planejados
- [ ] Exibir lucro por venda em SalesView e lucro do dia no Dashboard
- [ ] Módulo de Despesas
- [ ] Relatórios e gráficos de evolução do negócio

---

## [0.7.0] — 2026-06-09

### Contexto
Deploy do backend como **Firebase Function v2**, módulo completo de **movimentações de estoque** com ajuste manual, upload de imagens de produtos e avatares via **Firebase Storage**, e correções de confiabilidade (custom claims, normalização de e-mail, guard de sessão).

### Deploy como Firebase Function v2
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

### Módulo de Movimentações de Estoque (`StockMovementsModule`)

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

### Firebase Storage — Upload de Imagens (`StorageModule`)

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

### Guard de sessão desatualizada (`FirebaseAuthGuard`)

Tokens sem `businessId` nas custom claims agora são rejeitados com `401 Unauthorized` e mensagem `"Sessão desatualizada — faça login novamente"`. Exceção: rotas sob `/api/v1/auth/` (setup inicial do usuário não tem claims ainda).

```ts
if (!isPublic && !isAuthRoute && !decoded.businessId) {
  throw new UnauthorizedException('Sessão desatualizada — faça login novamente')
}
```

### Script de backfill de claims (`backend/scripts/fix-claims.ts`)
Utilitário para corrigir `role` e `businessId` nas custom claims de usuários cadastrados antes da nova lógica. Execução manual via `npx ts-node scripts/fix-claims.ts`.

### Normalização de e-mail

`auth.service.ts` e `users.service.ts` normalizam e-mails para **lowercase** em:
- Login (`POST /auth/login`)
- Cadastro de negócio
- Convite de usuário (`POST /users/invite`)
- Busca por e-mail ao vincular convite

Evita colisões entre `Usuario@gmail.com` e `usuario@gmail.com`.

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
```

### Variáveis de ambiente adicionadas

**Backend** (`backend/.env`):
```
FIREBASE_STORAGE_BUCKET=your-project.appspot.com
```

### Próximos passos planejados
- [ ] Exibir lucro por venda em SalesView e lucro do dia no Dashboard
- [ ] Módulo de Despesas
- [ ] Relatórios e gráficos de evolução do negócio

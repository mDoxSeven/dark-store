import test from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../src/lib/db.ts';
import { ALTA_GUILD_ID } from '../src/alta/rise.ts';
import { SUGGESTION_CHANNEL, SUGGESTION_ROLES, canReviewSuggestion, suggestionText, suggestionPanel, suggestionCard, reviewSuggestion, selectSuggestion, collectSuggestion } from '../src/alta/suggestions.ts';

test('painel tem cinco categorias; ficha pública é compacta e não oferece botões de análise', () => {
  const panel = suggestionPanel();
  assert.equal(panel.flags, 32768);
  const select = panel.components[0].components[1].components[0];
  assert.equal(select.options.length, 5);
  const record = { id: 'abc', authorId: '123', category: 'family', body: '**Ideia** para todos', status: 'PENDING', reviewerId: null };
  const privateCard = JSON.stringify(suggestionCard(record, true));
  assert.match(privateCard, /alta:suggestion:approve:abc/);
  const published = suggestionCard({ ...record, status: 'APPROVED' });
  assert.doesNotMatch(JSON.stringify(published), /custom_id/);
  assert.match(JSON.stringify(published), /<@123>/);
  assert.deepEqual(published.allowedMentions.parse, []);
});

test('somente cargos listados podem avaliar e texto respeita os limites', () => {
  for (const role of SUGGESTION_ROLES) assert.equal(canReviewSuggestion([role]), true);
  assert.equal(canReviewSuggestion(['administrator']), false);
  assert.throws(() => suggestionText('curto'));
  assert.throws(() => suggestionText('x'.repeat(1501)));
  assert.equal(suggestionText('  Minha sugestão!  '), 'Minha sugestão!');
});

async function withDatabase(mock, task) {
  const previous = [];
  for (const [model, methods] of Object.entries(mock)) for (const [method, value] of Object.entries(methods)) {
    previous.push([model, method, prisma[model][method]]);
    prisma[model][method] = value;
  }
  try { await task(); } finally { for (const [model, method, value] of previous) prisma[model][method] = value; }
}

test('seletor salva rascunho individual com expiração e rejeita painel antigo', async () => {
  let saved;
  const interaction = { guildId: ALTA_GUILD_ID, channelId: SUGGESTION_CHANNEL, message: { id: 'panel' }, user: { id: 'author' }, values: ['family'], deferReply: async () => {}, editReply: async () => {} };
  await withDatabase({ altaSuggestionConfig: { findUnique: async () => ({ panelMessageId: 'panel' }) }, altaSuggestion: { count: async () => 0 }, altaSuggestionDraft: { upsert: async args => { saved = args; } } }, async () => {
    await selectSuggestion(interaction);
    assert.equal(saved.create.userId, 'author');
    assert.equal(saved.create.category, 'family');
    assert.ok(saved.create.expiresAt > new Date());
    await assert.rejects(() => selectSuggestion({ ...interaction, message: { id: 'old' } }), /desatualizado/);
  });
});

for (const action of ['approve', 'reject']) test(`${action}: decisão única e publicação somente após aprovação`, async () => {
  let item = { id: 'abc', authorId: 'author', category: 'ideas', body: 'Uma atividade para todos', status: 'PENDING', reviewMessageId: 'review' };
  let publications = 0;
  const interaction = { guildId: ALTA_GUILD_ID, channelId: 'private', customId: `alta:suggestion:${action}:abc`, user: { id: 'staff' },
    deferReply: async () => {}, editReply: async () => {}, message: { id: 'review', edit: async () => {} },
    client: { users: { fetch: async () => null } }, guild: {
      members: { fetch: async () => ({ id: 'staff', roles: { cache: new Map([[SUGGESTION_ROLES[0], {}]]) } }) },
      channels: { fetch: async () => ({ isSendable: () => true, send: async () => { publications++; return { id: 'published' }; } }) },
    } };
  await withDatabase({ altaSuggestionConfig: { findUnique: async () => ({ reviewChannelId: 'private' }) }, altaSuggestion: {
    findUnique: async () => ({ ...item }), updateMany: async () => { if (item.status !== 'PENDING') return { count: 0 }; item.status = 'REVIEWING'; return { count: 1 }; },
    update: async ({ data }) => (item = { ...item, ...data }),
  } }, async () => {
    await reviewSuggestion(interaction);
    assert.equal(item.status, action === 'approve' ? 'APPROVED' : 'REJECTED');
    assert.equal(publications, action === 'approve' ? 1 : 0);
    await assert.rejects(() => reviewSuggestion(interaction), /já foi analisada/);
    const unauthorized = { ...interaction, guild: { ...interaction.guild, members: { fetch: async () => ({ roles: { cache: new Map() } }) } } };
    await assert.rejects(() => reviewSuggestion(unauthorized), /quatro cargos/);
  });
});

test('coleta envia somente à análise e apaga o original após salvar a referência', async () => {
  const events = [];
  const draft = { userId: 'author', category: 'family', expiresAt: new Date(Date.now() + 600000) };
  const message = { id: 'source', guildId: ALTA_GUILD_ID, channelId: SUGGESTION_CHANNEL,
    content: 'Uma nova atividade na família', attachments: new Map(),
    author: { id: 'author', bot: false, send: async () => events.push('dm') },
    delete: async () => events.push('delete-source'), reply: async () => {},
    guild: { channels: { fetch: async id => {
      assert.equal(id, 'private');
      return { isSendable: () => true, send: async () => { events.push('send-review'); return { id: 'review' }; } };
    } } },
  };
  await withDatabase({ altaSuggestionDraft: { findUnique: async () => draft, deleteMany: async () => events.push('delete-draft') },
    altaSuggestionConfig: { findUnique: async () => ({ reviewChannelId: 'private' }) },
    altaSuggestion: { create: async ({ data }) => ({ ...data, id: 'abc', status: 'PENDING' }), update: async ({ data }) => { assert.equal(data.reviewMessageId, 'review'); events.push('save-reference'); } },
  }, async () => {
    assert.equal(await collectSuggestion(message), true);
    assert.deepEqual(events, ['send-review', 'save-reference', 'delete-draft', 'delete-source', 'dm']);
  });
});

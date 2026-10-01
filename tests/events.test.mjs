import test from 'node:test';
import assert from 'node:assert/strict';
import { CHANNEL_DEFAULTS, EVENTS_GUILD, EVENTS_MANAGER_ROLES, EVENTS_VERIFIED, EVENTS_VERIFIER, attendanceOpen, parseEventDate, parseFunction } from '../src/events/config.ts';
import { rules, guide, v2 } from '../src/events/messages.ts';
import { eventsJoin, handleEventsInteraction } from '../src/events/module.ts';
import { prisma } from '../src/lib/db.ts';

test('canais recebidos e relatório da Liderança estão corretamente associados',()=>{
  assert.equal(CHANNEL_DEFAULTS.guia,'1443601757644259369');
  assert.equal(CHANNEL_DEFAULTS.relatorios,'1444032550413533295');
  assert.equal(CHANNEL_DEFAULTS.lideranca,'1542886994441408603');
  assert.equal(CHANNEL_DEFAULTS.aulinha,'1555280334004687018');
  assert.deepEqual(EVENTS_MANAGER_ROLES,['1443603327337369651','928355723329564692','1443603328008454304','1505968563712692257']);
});
test('verificador autorizado troca cargos em ordem e não aprova novamente',async()=>{
  const oldSettings=prisma.eventsSettings.upsert,oldFind=prisma.eventsRecord.findFirstOrThrow,oldUpdate=prisma.eventsRecord.update;
  const actions=[]; let status='PENDING';
  prisma.eventsSettings.upsert=async()=>({guildId:EVENTS_GUILD,channelsJson:'{}',managerRolesJson:'[]',functionsJson:'[]'});
  prisma.eventsRecord.findFirstOrThrow=async()=>({id:'request',kind:'verify',userId:'target',status,messageId:'review',channelId:'channel'});
  prisma.eventsRecord.update=async({data})=>{status=data.status;actions.push('persist');return {};};
  const actor={id:'person',roles:{cache:new Map([[EVENTS_VERIFIER,{}]])}};
  const target={roles:{add:async id=>actions.push(`add:${id}`),remove:async id=>actions.push(`remove:${id}`)}};
  const guild={id:EVENTS_GUILD,members:{fetch:async({user})=>user==='person'?actor:target},roles:{fetch:async()=>new Map([[EVENTS_VERIFIED,{editable:true}],['1555273066706112552',{editable:true}]])}};
  const i={...baseInteraction(),guild,message:{id:'review',edit:async()=>actions.push('edit')},editReply:async()=>{}};
  try{
    await handleEventsInteraction(i);
    assert.deepEqual(actions,[`add:${EVENTS_VERIFIED}`,'remove:1555273066706112552','persist','edit']);
    await assert.rejects(handleEventsInteraction(i),/já analisada/);
    assert.equal(actions.length,4);
  }finally{prisma.eventsSettings.upsert=oldSettings;prisma.eventsRecord.findFirstOrThrow=oldFind;prisma.eventsRecord.update=oldUpdate;}
});
test('V2 tem identidade turquesa, arte e menções desativadas',()=>{
  for(const panel of [rules(),guide(),v2('Teste','Conteúdo')]){
    assert.equal(panel.flags,32768);
    assert.equal(panel.components[0].accent_color,0x39c5bb);
    assert.deepEqual(panel.allowedMentions.parse,[]);
    assert.ok(!('content' in panel));
  }
  assert.match(JSON.stringify(rules()),/attachment:\/\/regras.png/);
});
test('data de Brasília válida; datas impossíveis e pontuação inválida são recusadas',()=>{
  assert.equal(parseEventDate('2026-10-03 16:00').toISOString(),'2026-10-03T19:00:00.000Z');
  for(const s of ['2026-02-30 16:00','2026-10-03 24:00','03/10/2026 16:00'])assert.throws(()=>parseEventDate(s));
  assert.deepEqual(parseFunction('host|Apresentador|20'),{key:'host',name:'Apresentador',points:20});
  for(const s of ['host|Teste|-1','host|Teste|2.5','host|Teste|','host|Teste|20|extra'])assert.throws(()=>parseFunction(s));
});
test('presença só pode ser solicitada dentro da janela de evento aprovado',()=>{
  const e={status:'APPROVED',startsAt:new Date('2026-10-03T19:00Z'),endsAt:new Date('2026-10-03T20:00Z')};
  assert.equal(attendanceOpen(e,new Date('2026-10-03T18:59Z')),false);
  assert.equal(attendanceOpen(e,new Date('2026-10-03T19:30Z')),true);
  assert.equal(attendanceOpen(e,new Date('2026-10-03T20:01Z')),false);
  assert.equal(attendanceOpen({...e,status:'CANCELLED'},new Date('2026-10-03T19:30Z')),false);
});
test('cargo inicial só se aplica em Eventos a humanos ainda não verificados',async()=>{
  const added=[];
  const m={guild:{id:EVENTS_GUILD},user:{bot:false},roles:{cache:new Map(),add:async id=>added.push(id)}};
  await eventsJoin(m); assert.equal(added.length,1);
  await eventsJoin({...m,guild:{id:'other'}});
  await eventsJoin({...m,user:{bot:true}});
  await eventsJoin({...m,roles:{...m.roles,cache:new Map([[EVENTS_VERIFIED,{}]])}});
  assert.equal(added.length,1);
});
const baseInteraction=()=>({isButton:()=>true,isStringSelectMenu:()=>false,isModalSubmit:()=>false,customId:'ev:approve:request',guildId:EVENTS_GUILD,user:{id:'person'},message:{id:'review'},channelId:'channel',deferReply:async()=>{}});
test('interações falsificadas de outro servidor são rejeitadas antes de consultar banco',async()=>{
  await assert.rejects(handleEventsInteraction({...baseInteraction(),guildId:'other',guild:{}}),/servidor de Eventos/);
});
test('verificação não aceita gestor sem cargo de verificador, nem permite pontos a verificador',async()=>{
  const oldSettings=prisma.eventsSettings.upsert,oldFind=prisma.eventsRecord.findFirstOrThrow;
  prisma.eventsSettings.upsert=async()=>({guildId:EVENTS_GUILD,channelsJson:'{}',managerRolesJson:'["manager"]',functionsJson:'[]'});
  const guild={id:EVENTS_GUILD,ownerId:'owner',members:{fetch:async()=>({id:'person',guild:{ownerId:'owner'},roles:{cache:new Map([['manager',{}]])}})}};
  prisma.eventsRecord.findFirstOrThrow=async()=>({id:'request',kind:'verify',status:'PENDING'});
  try{
    await assert.rejects(handleEventsInteraction({...baseInteraction(),guild}),/cargo autorizado/);
    guild.members.fetch=async()=>({id:'person',guild:{ownerId:'owner'},roles:{cache:new Map([[EVENTS_VERIFIER,{}],[EVENTS_VERIFIED,{}]])}});
    await assert.rejects(handleEventsInteraction({...baseInteraction(),customId:'ev:attapprove:attendance',guild}),/Somente a gestão/);
  }finally{prisma.eventsSettings.upsert=oldSettings;prisma.eventsRecord.findFirstOrThrow=oldFind;}
});
test('validação de presença contabiliza uma única decisão e não altera o valor congelado',async()=>{
  const previous=[prisma.eventsSettings.upsert,prisma.eventsAttendance.findFirstOrThrow,prisma.eventsAttendance.updateMany];
  let status='PENDING';let updates=0;
  prisma.eventsSettings.upsert=async()=>({guildId:EVENTS_GUILD,channelsJson:'{"analise":"channel"}',managerRolesJson:'["manager"]',functionsJson:'[]'});
  prisma.eventsAttendance.findFirstOrThrow=async()=>({id:'attendance',messageId:'review',eventId:'event',userId:'target',functionName:'Apresentador',points:20,status});
  prisma.eventsAttendance.updateMany=async({where,data})=>{
    assert.equal(where.status,'PENDING');assert.equal('points' in data,false);
    if(status!=='PENDING')return {count:0};status=data.status;updates++;return {count:1};
  };
  const guild={id:EVENTS_GUILD,members:{fetch:async()=>({id:'person',roles:{cache:new Map([['manager',{}]])}})}};
  const i={...baseInteraction(),customId:'ev:attapprove:attendance',guild,message:{id:'review',edit:async()=>{}},editReply:async()=>{}};
  try{
    await handleEventsInteraction(i);
    await assert.rejects(handleEventsInteraction(i),/já analisada/);
    assert.equal(updates,1);assert.equal(status,'APPROVED');
  }finally{[prisma.eventsSettings.upsert,prisma.eventsAttendance.findFirstOrThrow,prisma.eventsAttendance.updateMany]=previous;}
});

const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

(async () => {
  try {
    const agents = await p.agent.findMany({
      where: { isHouseAgent: true },
      select: { id: true, name: true, displayName: true, domainId: true, llmProvider: true, llmModel: true, persona: true }
    });
    console.log('House agents:', agents.length);
    agents.forEach(a => console.log('  ', a.name, '|', a.llmProvider, '|', a.llmModel, '|', a.domainId?.slice(0,8)));

    const domains = await p.domain.findMany({ select: { id: true, slug: true, name: true } });
    console.log('\nDomains:', domains.length);
    domains.forEach(d => console.log('  ', d.slug, '|', d.name));

    const questions = await p.question.count();
    console.log('\nQuestions:', questions);

    const creations = await p.creation.count();
    console.log('Creations:', creations);
  } catch (e) {
    console.error(e.message);
  } finally {
    await p.$disconnect();
  }
})();

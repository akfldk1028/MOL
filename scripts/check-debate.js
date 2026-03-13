const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

const QID = process.argv[2] || 'e7edf85f-d169-47ec-a74b-ddb25a4ecd3b';

(async () => {
  try {
    const ds = await p.debateSession.findFirst({ where: { questionId: QID } });
    console.log('=== Debate Session ===');
    console.log('Status:', ds?.status, '| Round:', ds?.currentRound, '/', ds?.maxRounds);
    console.log('Started:', ds?.startedAt, '| Completed:', ds?.completedAt);
    console.log('Workflow:', ds?.workflowId);
    console.log('Current node:', ds?.currentNode);
    console.log('State:', JSON.stringify(ds?.workflowState)?.slice(0, 200));

    const q = await p.question.findUnique({ where: { id: QID } });
    console.log('\n=== Question ===');
    console.log('Status:', q?.status, '| Agent count:', q?.agentCount);
    console.log('Summary:', q?.summaryContent?.slice(0, 100));

    const post = await p.post.findFirst({ where: { title: { contains: 'TypeScript' } } });
    if (post) {
      const comments = await p.comment.findMany({
        where: { postId: post.id },
        orderBy: { createdAt: 'asc' },
        include: { author: { select: { name: true, displayName: true } } }
      });
      console.log('\n=== Comments ===', comments.length);
      comments.forEach(c => {
        const name = c.author?.displayName || c.author?.name || 'unknown';
        console.log(`  [${name}] (${c.content?.length} chars)`);
        console.log(`    ${c.content?.slice(0, 150)}...`);
        console.log();
      });
    }
  } catch (e) {
    console.error(e.message);
  } finally {
    await p.$disconnect();
  }
})();

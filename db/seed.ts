import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { posts, works, workDetails, workTags } from "./schema";

const client = new Database("./blog.db");
const db = drizzle(client);

const seedData = {
  posts: [
    {
      slug: "silence-in-fiction",
      title: "The Weight of Silence in Modern Fiction",
      titleZh: "现代小说中沉默的重量",
      excerpt: "In an age of constant noise, the most powerful literary moments are often those that say nothing at all. We explore how contemporary writers use silence as a narrative force.",
      excerptZh: "在噪音不断的时代，最有力的文学时刻往往是那些什么都不说的时刻。",
      content: JSON.stringify([
        "There is a peculiar kind of power in what is left unsaid. In an era where every thought finds its way into a tweet, a story, a notification, the deliberate act of silence becomes almost transgressive. Modern fiction has begun to recognize this — not as absence, but as a presence with its own weight, texture, and gravity.",
        "Consider the opening of a novel where two characters sit across from each other at a kitchen table. The coffee grows cold. Outside, rain taps against the window with mechanical precision. Neither speaks. Yet within that silence, entire universes of meaning are exchanged — histories, grievances, reconciliations.",
        "Contemporary writers like Sally Rooney and Karl Ove Knausgård have mastered this technique. Rooney's characters often find themselves in moments of suspended conversation, where the dialogue stops but the emotional current intensifies.",
        "Silence in fiction operates on multiple frequencies. There is the silence between words — the pause that lets a revelation land. There is the silence between characters — the things they cannot or will not say.",
        "The Japanese concept of ma — the negative space between objects, between sounds, between moments — offers a useful framework. In traditional Noh theater, silence is not the absence of performance but an integral part of it.",
        "But silence is also political. In a world that demands constant self-disclosure, choosing not to speak — or writing characters who choose not to speak — becomes a form of resistance.",
        "The most haunting novels are often those that leave us with questions rather than answers. Not because the author was careless, but because they understood that some truths can only be approached obliquely.",
      ]),
      category: "LITERATURE",
      coverImage: "/images/post1.jpg",
      publishedDate: "2026.04.12",
      wordCount: 2450,
      published: true,
    },
    {
      slug: "brutalism-revisited",
      title: "Brutalism Revisited: Form Follows Friction",
      titleZh: "粗野主义再审视：形式追随摩擦",
      excerpt: "Why the raw, unpolished aesthetic of brutalist design continues to resonate in a world obsessed with perfection. A meditation on intentional discomfort in visual culture.",
      excerptZh: "粗野主义设计原始、未经打磨的美学为何在追求完美主义的世界中持续产生共鸣。",
      content: JSON.stringify([
        "There is something deeply honest about concrete. It does not pretend to be marble or wood. It does not smooth its edges or hide its seams. What you see is what you get — aggregate, cement, water, and the ghost of the wooden forms that shaped it.",
        "The term 'brutalism' comes from the French béton brut — raw concrete. It emerged in architecture during the 1950s, championed by architects like Le Corbusier and Alison and Peter Smithson.",
        "In web design, brutalism arrived as a rebellion. Against the homogenization of templates. Against the smooth, frictionless user experiences that had become indistinguishable from one another.",
        "What makes brutalist design endure is not merely its contrarian spirit but its genuine usefulness. In a world where every surface has been optimized for engagement, brutalism reintroduces friction.",
        "Think about it. When a website demands that you work a little harder to find what you need, you become more invested in the outcome.",
        "The concrete staircase in the photograph above exemplifies this philosophy. It is not inviting. It does not welcome you with soft lighting or gentle curves. It challenges you to climb.",
        "Brutalism is not an absence of design but a different kind of design — one that prioritizes expression over conversion, authenticity over optimization.",
      ]),
      category: "DESIGN",
      coverImage: "/images/post2.jpg",
      publishedDate: "2026.03.28",
      wordCount: 2100,
      published: true,
    },
    {
      slug: "solitude-creative",
      title: "Solitude as a Creative Practice",
      titleZh: "孤独作为一种创造性实践",
      excerpt: "The relationship between being alone and making meaningful work. What happens when we stop optimizing our attention and start protecting it instead.",
      excerptZh: "独处与创作有意义作品之间的关系。当我们停止优化注意力，开始保护它时会发生什么。",
      content: JSON.stringify([
        "The tree stands alone in the field. It has always stood alone. No other tree crowds its roots or competes for its light. In spring, it flowers for itself. In autumn, it drops leaves that no one rakes.",
        "For the creative person, solitude operates in much the same way. Not as a deficiency to be remedied, but as a necessary condition for certain kinds of work.",
        "We have become suspicious of solitude. In a culture that equates busyness with productivity and connectivity with value, being alone looks like failure.",
        "But the creatives who produce work of lasting value often have a different relationship with being alone. They do not merely tolerate solitude — they seek it, protect it, cultivate it.",
        "There is a distinction between loneliness and solitude. Loneliness is the ache of unwanted isolation. Solitude is the clarity of chosen separation.",
        "The philosopher Michel de Montaigne retired to the tower of his family estate to write. Thoreau built his cabin at Walden. Proust lined his bedroom walls with cork.",
        "This is not a call for hermitage. Human connection nourishes creativity in its own essential ways. But it is a reminder that solitude and society are not opposites.",
        "Protect your solitude as you would protect any other resource essential to your work. Build walls where you need them. Close doors. Turn off lights.",
      ]),
      category: "REFLECTION",
      coverImage: "/images/post3.jpg",
      publishedDate: "2026.03.15",
      wordCount: 2800,
      published: true,
    },
    {
      slug: "craft-of-typing",
      title: "The Craft of Slow Typing",
      titleZh: "慢速打字的工艺",
      excerpt: "On the lost art of composing at the speed of thought, and why the fastest keyboard is not always the best.",
      excerptZh: "关于以思考速度进行创作的失传艺术，以及为什么最快的键盘并不总是最好的。",
      content: JSON.stringify([
        "There is a rhythm to writing on a typewriter that no modern keyboard can replicate. Each keystrike requires deliberate force. Each letter lands on the page with the finality of a footprint in wet cement.",
        "We have spent decades making writing faster. From the mechanical typewriter to the electric, from the word processor to the smartphone, each iteration promised to remove the friction between thought and text.",
        "The poet Donald Hall wrote all his drafts in longhand. He believed that the physical act of shaping letters with a pen slowed his mind to the pace of genuine composition.",
        "There is something about speed that corrupts. When we write too quickly, we write what we already know. The cliches arrive first because they are the fastest.",
        "The typewriter in the photograph understands this. It has no spell-check, no grammar suggestion, no cloud backup. It offers only the blank page and the mechanical precision of its keys.",
        "Perhaps we need to reintroduce friction into our writing practice. Not as a form of masochism, but as a method of attention. The constraint forces creativity.",
      ]),
      category: "LITERATURE",
      coverImage: "/images/post4.jpg",
      publishedDate: "2026.02.28",
      wordCount: 1900,
      published: true,
    },
    {
      slug: "surface-of-water",
      title: "On the Surface of Water",
      titleZh: "水面之上",
      excerpt: "Stillness is not the absence of movement but the presence of a deeper current beneath.",
      excerptZh: "静止并非运动的缺失，而是深层暗流的存在。",
      content: JSON.stringify([
        "The ocean at dusk does not announce itself. It simply exists — a vast, breathing surface of dark water stretching toward a horizon that dissolves into sky.",
        "We are drawn to the dramatic. The storm, the shipwreck, the wave that towers above the shore. But the ocean's real character is revealed in moments like this.",
        "Standing at the water's edge, you begin to understand that stillness is not emptiness. Beneath the unmoving surface, currents travel thousands of miles.",
        "The philosopher Simone Weil wrote that attention is the rarest and purest form of generosity. To look at the ocean — truly look, without the filter of language or expectation — is to practice this generosity.",
        "There is a meditative quality to water that no other element possesses. Fire consumes. Earth resists. Air escapes. But water receives.",
      ]),
      category: "REFLECTION",
      coverImage: "/images/post5.jpg",
      publishedDate: "2026.02.10",
      wordCount: 1650,
      published: true,
    },
    {
      slug: "old-books",
      title: "The Patina of Old Books",
      titleZh: "旧书的光泽",
      excerpt: "What worn spines and yellowed pages can teach us about time, memory, and the materiality of reading.",
      excerptZh: "磨损的书脊和泛黄的纸张能教会我们关于时间、记忆和阅读物质性的一切。",
      content: JSON.stringify([
        "An old book is a physical record of time. The yellowed pages are not damaged — they are weathered, like the face of someone who has lived a full life.",
        "In our rush toward digitization, we have forgotten the importance of materiality. An e-book weighs nothing. It leaves no trace. It cannot be inscribed in the margins.",
        "The book in the photograph has a spine that has been handled so many times the leather has begun to crack along the seams. This is not a failure of craftsmanship but a success of use.",
        "Walter Benjamin wrote about the 'aura' of an original work of art — the unique presence of an object in time and space. Old books possess this aura in abundance.",
        "To read an old book is to enter into a relationship not only with its author but with every previous reader who has held it.",
        "We need to value the physical book not out of nostalgia but out of recognition that some forms of knowledge can only be held in the hand.",
      ]),
      category: "LITERATURE",
      coverImage: "/images/post6.jpg",
      publishedDate: "2026.01.22",
      wordCount: 2050,
      published: true,
    },
  ],

  works: [
    {
      slug: "project-alpha",
      title: "Project Alpha",
      subtitle: "A minimalist design system for digital publications",
      category: "DESIGN SYSTEM",
      description: "A comprehensive typographic and component framework designed specifically for long-form reading experiences across web and print.",
      year: "2026",
      coverImage: "/images/works-alpha.jpg",
      link: "#",
      published: true,
      details: [
        "Project Alpha began as an internal experiment to solve a persistent problem: how do you design a reading interface that respects the content without competing with it?",
        "The system is built on three core principles. First, hierarchy through typography alone. Second, modular rhythm. Third, progressive disclosure.",
        "The type stack uses Newsreader for display, Inter for interface, and JetBrains Mono for metadata. The color system is intentionally limited.",
        "Over six months, Alpha was tested on three publications with different content types. In each case, the system adapted gracefully.",
        "What surprised us most was how the constraints of Alpha became generative. Designers working within the system reported that limitations forced them to think more carefully.",
        "Alpha remains a work in progress. The next phase focuses on dynamic theming — allowing publications to inject their own color and type preferences.",
      ],
      tags: ["TypeScript", "React", "Figma", "Design System"],
    },
    {
      slug: "echo-archive",
      title: "Echo Archive",
      subtitle: "An audio library for forgotten conversations",
      category: "WEB APPLICATION",
      description: "A searchable, browsable collection of historical interviews and oral histories, preserved with original context and metadata.",
      year: "2025",
      coverImage: "/images/works-echo.jpg",
      link: "#",
      published: true,
      details: [
        "Echo Archive started with a shoebox. In a basement in Portland, a journalist named Elena Voss had spent forty years recording interviews on cassette, then minidisc, then digital recorder.",
        "The technical challenge was not transcription. Modern speech-to-text handles that well enough. The real problem was context.",
        "Echo Archive preserves the original audio alongside the transcript, synchronized word-by-word. The waveform visualization beneath the transcript gives the reader a sense of rhythm.",
        "The interface is deliberately analog-inspired. The waveform is rendered in warm monochrome. The transcript uses a wide measure with generous leading.",
        "Metadata is treated as seriously as the content itself. Each recording includes date, location, recording device, weather conditions, and a brief note.",
        "The archive currently holds 340 interviews, with 80 fully processed and published. The remaining 260 are in various states of transcription and review.",
      ],
      tags: ["Next.js", "Node.js", "PostgreSQL", "Audio API"],
    },
    {
      slug: "solstice-journal",
      title: "Solstice Journal",
      subtitle: "A quarterly print publication on craft and contemplation",
      category: "PUBLICATION",
      description: "An independent magazine blending long-form essays on creative practice with visual portfolios and quiet interludes for reflection.",
      year: "2024",
      coverImage: "/images/works-solstice.jpg",
      link: "#",
      published: true,
      details: [
        "Solstice Journal was founded on a simple premise: there should be a place for writing that takes longer to read than it takes to write a tweet.",
        "The physical object matters. Solstice is printed on uncoated stock with a sewn binding, allowing the magazine to lay flat when opened.",
        "The editorial process is slow by design. Essays are commissioned nine months before publication. Drafts go through at least four rounds of revision.",
        "The first four issues have sold approximately 3,000 copies each, primarily through independent bookstores and direct subscription.",
        "The digital companion to the print journal is intentionally minimal. Each issue gets a single-page website with the table of contents.",
        "Future plans include a fifth issue on the theme of 'residue' — what remains after a project ends, a relationship ends, an era ends.",
      ],
      tags: ["Editorial", "Print Design", "Typography", "Publishing"],
    },
  ],
};

async function seed() {
  console.log("Seeding database...");

  // Seed posts
  for (const post of seedData.posts) {
    await db.insert(posts).values(post);
  }
  console.log(`Inserted ${seedData.posts.length} posts`);

  // Seed works
  for (const work of seedData.works) {
    const result = await db.insert(works).values({
      slug: work.slug,
      title: work.title,
      subtitle: work.subtitle,
      category: work.category,
      description: work.description,
      year: work.year,
      coverImage: work.coverImage,
      link: work.link,
      published: work.published,
    });

    const workId = Number(result.lastInsertRowid);

    // Seed work details
    for (let i = 0; i < work.details.length; i++) {
      await db.insert(workDetails).values({
        workId,
        content: work.details[i],
        sortOrder: i,
      });
    }

    // Seed work tags
    for (const tag of work.tags) {
      await db.insert(workTags).values({
        workId,
        name: tag,
      });
    }
  }
  console.log(`Inserted ${seedData.works.length} works with details and tags`);

  console.log("Seed complete!");
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});

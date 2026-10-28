// The résumé content. The page only displays this; edit the words here, not in the components.
// Dates are strings so they can be as exact as we know them: 'YYYY-MM' or just 'YYYY'. An end of 'present' means ongoing.
// In the summary, **double asterisks** make a phrase cyan.
// This file ships in a public repo and in the bundle: only put in what is public.

export type Side = 'left' | 'right'

// One thing on the timeline. Events are listed newest first, by hand, and shown in this order.
// Which side of the wire an entry goes on is worked out in src/lib/timeline.ts; an optional `side` overrides it.
export type TimelineEvent =
  | { kind: 'status'; text: string }
  // The closing card under the wire, mirroring the status banner at the top. Only the first one is shown.
  | { kind: 'education'; credential: string; school: string; start: string; end: string }
  // A moment on the wire. A blank `text` is a placeholder to fill in later and is not shown.
  | { kind: 'milestone'; date: string; text: string; side?: Side }
  | {
      kind: 'role'
      side?: Side
      employer: string
      title: string
      start: string
      end: string
      location?: string
      summary?: string
      bullets: string[]
      // Start with the bullets folded away (the summary and badges still show). Descartes roles stay open.
      collapsed?: boolean
      // Technologies used in the role, shown as badges on the card. Order: languages and application frameworks,
      // then infrastructure frameworks and build tools, then platforms (databases, hosting, monitoring).
      tech?: string[]
      // Non-technical skills the role built or used (leadership, architecture), shown as green badges.
      skills?: string[]
      // Concepts and standards that are not one specific technology (REST, NoSQL), shown as silver badges.
      concepts?: string[]
    }

export const resume = {
  name: 'John LeBoeuf-Little',
  headline: 'Senior Software Engineer / Engineering Manager / SRE',
  // Also the footer tagline and the last line of the summary; the landing page dossier shows it as MISSION.
  mission: 'I use tech to empower people.',
  contact: {
    email: 'worldnamer@gmail.com',
    linkedin: 'https://linkedin.com/in/worldnamer',
    github: 'https://github.com/worldnamer',
    phone: 'available on request',
  },
  summary: [
    "Senior engineering leader with **26 years of experience** across software development, engineering management, systems architecture, and site reliability. **I've built teams, set technical direction, and stayed close to the code.** Most recently, at Descartes Aljex, I led the migration from on-premises infrastructure to Azure-hosted Kubernetes and designed the multi-tenant architecture behind its enterprise logistics software.",
    "Whether through code, architecture, or mentorship, my focus is on building systems that improve people's lives. **I use tech to empower people.**",
  ],
  timeline: [
    {
      kind: 'status',
      text: 'Currently #openToWork, looking for new opportunities to empower people through technology.',
    },
    // Leaving Descartes Aljex
    {
      kind: 'milestone',
      date: '2026-09',
      text: 'I was laid off with several others as part of a reduction in force.',
    },
    {
      kind: 'role',
      employer: 'Descartes Aljex',
      title: 'Site Reliability Engineer',
      tech: ['Python', 'Bash', 'Rails', 'Kubernetes', 'Docker', 'Terraform', 'PostgreSQL', 'Redis', 'New Relic', 'Graylog', 'ArgoCD', 'Azure', 'Azure DevOps', 'Azure Insights', 'HAProxy'],
      concepts: ['CI/CD', 'Infrastructure as Code'],
      skills: ['Incident Response', 'DevOps'],
      start: '2023',
      end: '2026',
      location: 'Boulder, CO',
      bullets: [
        'Led the migration from on-premises infrastructure to Azure-hosted Kubernetes, building a 30+ node cluster from scratch and migrating the full technology stack.',
        'Designed and implemented a tiered partition architecture that split production across multiple databases, with dedicated Kubernetes node pools per tier. This enabled premium service offerings for enterprise customers: dedicated resources, isolated databases, and canary deployment paths.',
        'Implemented custom ingress routing with HAProxy rules, ArgoCD for deployment management and rollback, and Terraform for infrastructure-as-code across WAF, networking, and cluster components.',
        'Established observability across the stack using New Relic, Graylog, and Azure Insights.',
      ],
    },
    {
      kind: 'role',
      employer: 'Descartes Aljex',
      title: 'Systems Architect',
      tech: ['TypeScript', 'Rails', 'Sidekiq', 'Vue.js', 'Node.js', 'Docker', 'Redis', 'Azure Blob Storage'],
      concepts: ['REST', 'OAuth', 'EDI'],
      skills: ['Systems Architecture'],
      start: '2020',
      end: '2023',
      location: 'Boulder, CO',
      bullets: [
        'Transitioned from engineering manager to software architect, designing systems to bridge legacy and modern infrastructure.',
        'Championed the adoption of Docker: researched it, taught it to the team, and led its first use in the stack.',
        'Set direction on the replication pipeline: data stored in one system was sent through a Rails middleware layer, queued in Sidekiq, and posted to a REST API to be ingested.',
        "Integrated with Descartes' single sign-on service over REST and OAuth.",
        'Made framework choices for both frontend and backend, including standards around Vue.js, Node.js, caching, file storage, and reporting (with code that generated custom PDFs).',
        'Worked with EDI integrations and helped plan how the platform would carry the load of EDI traffic.',
      ],
    },
    {
      kind: 'role',
      employer: 'Descartes Aljex',
      title: 'Engineering Manager',
      tech: ['Rails', 'Redis'],
      concepts: ['Scrum'],
      skills: ['Engineering Management', 'Mentorship'],
      start: '2018',
      end: '2020',
      location: 'Boulder, CO',
      bullets: [
        'Built and managed a team of 5–7 Rails engineers through post-acquisition growth, ran 1-on-1s and performance reviews, introduced scrum ceremonies, and stayed hands-on as an individual contributor.',
        'Set engineering standards for the team, such as coding standards, framework choices, and adopting more mature software workflows.',
      ],
    },
    { kind: 'milestone', date: '2018', text: 'Aljex is acquired by Descartes Systems Group.' },
    {
      kind: 'role',
      employer: 'Descartes Aljex',
      title: 'Senior Software Engineer',
      tech: ['TypeScript', 'Rails', 'Node.js', 'Vue.js', 'Redis'],
      concepts: ['Integrations'],
      skills: ['Technical Leadership'],
      start: '2016',
      end: '2018',
      location: 'Boulder, CO',
      bullets: [
        "Joined as the company's first Rails lead to modernize a PHP-based logistics platform.",
        'Led the development of the first Rails component of the new ecosystem, an Accounting system handling receivables, payables, reporting, and invoicing, and integrating with providers like QuickBooks.',
        'Also worked on wide-ranging projects, such as a job board system, as well as the initial architecture of the rewrite of the flagship product, Aljex Live.',
        'Built full-stack across Rails backends and TypeScript-based Node.js and Vue.js frontends.',
        "This transformation contributed to the company's acquisition by Descartes Systems Group in 2018.",
      ],
    },
    {
      kind: 'milestone',
      date: '2016-02',
      text: 'The Pearson team and product wound down. I joined Aljex to reinvent its existing PHP architecture as a Rails-powered platform.',
    },
    {
      kind: 'role',
      employer: 'Pearson',
      title: 'Senior Lead Software Developer',
      collapsed: true,
      tech: ['Rails'],
      concepts: ['Real-time Web Apps'],
      start: '2013',
      end: '2016',
      summary:
        'Classroom testing software: a web app teachers used to run quizzes that their students connected to in class.',
      bullets: [
        'Built Rails features for the platform as a senior engineer on a team of about five.',
        'Helped teachers gauge how well students understood material during the semester, so gaps could be cleared up while there was still time to act.',
      ],
    },
    // Leaving Kapost, joining Pearson
    {
      kind: 'milestone',
      date: '2013-11',
      text: 'Kapost changed tech stacks. I moved on to Pearson.',
    },
    {
      kind: 'role',
      employer: 'Kapost',
      title: 'Lead Engineer',
      collapsed: true,
      tech: ['Ruby', 'CoffeeScript', 'Rails', 'jQuery', 'Mongoid', 'HAML', 'MongoDB', 'Heroku'],
      concepts: ['NoSQL'],
      skills: ['Incident Response'],
      start: '2012-02',
      end: '2013-11',
      location: 'Boulder, CO',
      summary:
        'Rails development for a content marketing platform with workflow tools and analytics.',
      bullets: [
        "Built the second generation of Kapost's analytics, letting customers slice their data dynamically by date, metric, or any combination of filters.",
        'Integrated social metrics from Twitter, Facebook, and LinkedIn, including background jobs that pulled follower and retweet statistics for promoted content, with visualizations of the data.',
        'Added "representatives", a new class of user that let customers act as an agency for content creation.',
        'Added post autosaving with multi-user awareness, so two people editing the same post are made aware of each other.',
        'Built new UIs with jQuery, CoffeeScript, HAML, and ERB, and took regular turns on production support, troubleshooting everything from ordinary bugs to dependency failures.',
      ],
    },
    // Leaving Fuhu, joining Kapost
    {
      kind: 'milestone',
      date: '2012-02',
      text: "Fuhu shifted focus from its children's tablet to building an MMO. I took a chance on transitioning from Java to Rails.",
    },
    {
      kind: 'role',
      employer: 'Fuhu, Inc',
      title: 'Senior Java Developer and Team Lead',
      collapsed: true,
      tech: ['Java', 'Spring', 'Hibernate', 'RESTEasy', 'Maven', 'Lucene', 'JBoss'],
      concepts: ['REST'],
      skills: ['Team Leadership'],
      start: '2010-11',
      end: '2012-02',
      summary:
        "A greenfield Android application store, later adopted as the store for Fuhu's children's tablet.",
      bullets: [
        'Led development of the store: made the technology decisions, set up the infrastructure, owned the architecture, designed, documented, and built the REST services, and taught the team to do the same.',
        'Delivered the store in about half a year with a team that was new to Java EE. It supported purchasing, multiple ways to browse applications, free-text search, and more.',
        "Adapted the store for the company's children's Android tablet, adding kid-safe catalogs to turn around a new product demo in a single sprint.",
        'Rolled out development, staging, and production environments on cloud servers, working with sysadmins on build scripts and network topology and troubleshooting firewall and routing issues.',
        'Coordinated teams in San Jose, Los Angeles, and Taiwan to meet deliverables for high-profile demos for Best Buy, Acer, and Toys R Us.',
      ],
    },
    // Joining Fuhu
    {
      kind: 'milestone',
      date: '2010-11',
      text: 'I joined Fuhu to build a new product from scratch with a brand-new team, and was made team lead in the first week.',
    },
    {
      kind: 'role',
      employer: 'Standing Cloud',
      title: 'Senior Java Developer',
      collapsed: true,
      tech: ['Java', 'Spring', 'Hibernate', 'Struts', 'Ant', 'Ivy', 'MySQL', 'JBoss'],
      concepts: ['OpenID', 'OAuth'],
      start: '2010-05',
      end: '2010-10',
      summary:
        'StandingCloud.com, a site that let customers install open-source software on cloud servers without dealing with the cloud providers themselves.',
      bullets: [
        'Added customer-facing features, including OpenID and Facebook login, binary file upload and download to servers, click-to-configure application plugins, and upload and install of user-provided modules, plugins, and themes.',
        'Fixed site problems, including HTML-injection security holes, domain validation, the credential-removal flow, and excess server backups.',
        "Served as the team's JPA/Hibernate expert, reducing eager fetches, improving transaction semantics, and speeding up queries with fetch joins.",
        'Cut build times from ten minutes to one.',
      ],
    },
    // Leaving McKesson, joining Standing Cloud
    {
      kind: 'milestone',
      date: '2010-05',
      text: 'McKesson was an interim contract. I moved on to try an early-stage startup.',
    },
    {
      kind: 'role',
      employer: 'McKesson',
      title: 'Contract Software Developer',
      collapsed: true,
      tech: ['Java', 'Spring', 'Hibernate', 'GWT', 'Ant', 'Oracle', 'JBoss'],
      concepts: ['ORM'],
      start: '2010-01',
      end: '2010-05',
      summary:
        'Ambulatory patient reception and management software for hospitals.',
      bullets: [
        'Re-engineered a legacy data layer from a homebrewed O/RM to Hibernate, and took the lead in prototyping the solution for the whole group.',
        'Worked on a physician quality reporting system that let clients report PQRI data with minimal overhead.',
        'Used GWT to build user interfaces quickly against a JBoss backend.',
      ],
    },
    // Leaving ZedUSA, joining McKesson
    { kind: 'milestone', date: '2010-01', text: 'I left ZedUSA after its acquisition for contract work back in Java.' },
    {
      kind: 'role',
      employer: 'ZedUSA',
      title: 'Software Developer III',
      collapsed: true,
      tech: ['C#', 'Java', 'NHibernate', 'Spring.NET', 'Spring', 'Hibernate', 'Ant', 'SQL Server'],
      concepts: ['Dependency Injection'],
      skills: ['Software Architecture'],
      start: '2008-10',
      end: '2010-01',
      summary: 'Multimedia and messaging services for BREW handsets.',
      bullets: [
        'Re-engineered a multimedia distribution system for BREW phones onto next-generation services.',
        'Cut the maintenance costs of an SMS delivery application by fixing bugs and adding crash recovery, integrated directly with US Cellular to reduce per-message costs, and made the code maintainable with unit tests, documentation, and diagrams.',
        'Architected an alerting system for email and SMS, a session-tracking system for handset application variables across requests, and a load-testing tool for the handset server.',
        'Was sole support for a mission-critical system behind a new-revenue handset client application, brought it to production-ready status, and reused the code base to launch two more products.',
      ],
    },
    // Leaving Acxiom, joining ZedUSA
    {
      kind: 'milestone',
      date: '2008-10',
      text: 'I was asked by a good friend to join their team and learn a new stack.',
    },
    {
      kind: 'role',
      employer: 'Acxiom',
      title: 'Team Lead and Senior Programmer',
      collapsed: true,
      tech: ['Java', 'C++', 'Spring', 'JSP', 'jQuery', 'JBoss', 'SQL Server', 'Oracle'],
      concepts: ['SOAP'],
      skills: ['Team Leadership'],
      start: '2006-05',
      end: '2008-10',
      summary: 'A new debt-collection application.',
      bullets: [
        'Led a cross-functional team of nine to build the application, a customer-facing product plus an internal user-management application. Promoted to team lead during the role.',
        'Worked with management and stakeholders to set schedules, define functional specifications, and manage resources against tight deadlines.',
        'Co-authored a common programming framework for integrating diverse data platforms in future applications.',
        "Built and deployed a SOAP service for accessing criminal records data (Tomcat, Axis), wrote C++ scoring modules for the company's fraud-prevention service, and wrote a J2EE/JBoss service to manage sessions for web applications.",
      ],
    },
    // Leaving Wall Street On Demand, joining Acxiom
    {
      kind: 'milestone',
      date: '2006-05',
      text: 'I grew out of my role and signed on at Acxiom to learn Java.',
    },
    {
      kind: 'role',
      employer: 'Wall Street On Demand',
      title: 'Engineer',
      collapsed: true,
      tech: ['C++', 'JavaScript', 'COM', 'XML', 'XSL', 'SQL Server', 'ImageMagick', 'Ghostscript'],
      concepts: ['Search', 'Web Services'],
      start: '2002-10',
      end: '2006-05',
      summary: 'Financial data, alerting, and charting services for Fortune 500 clients.',
      bullets: [
        'Document Management (2002–04): managed a proprietary mass storage system holding over 25 TB of data and growing about 6 GB a week, built document indexing, search, and reporting tools on AltaVista, Verity, and in-house search technology, and wrote software to deliver real-time news data to web clients.',
        'Distribution Engineering (2004–05): maintained and developed a large-scale alert system for stock-price and other financial events by email, pager, fax, and mail, built a fault-monitoring system that tracked sent and unsent alerts, and led the migration of over a dozen legacy systems to the current architecture, retroactively writing their specifications.',
        'Image Engineering (2005–06): developed a JavaScript/COM service that built custom charts and reports for Fortune 500 clients such as Wells Fargo, Goldman Sachs, and Fidelity, and spearheaded converting the legacy C++ system to it for better reliability.',
      ],
    },
    // Leaving TN & Associates, rejoining Wall Street On Demand
    {
      kind: 'milestone',
      date: '2002',
      text: "The startup attempt didn't pan out. I returned to Wall Street On Demand.",
    },
    {
      kind: 'role',
      employer: 'TN & Associates',
      title: 'Software Developer',
      collapsed: true,
      tech: ['C++'],
      start: '2001',
      end: '2002',
      location: 'Las Vegas, NV',
      summary: 'A startup division of TN & Associates, three people in all, building source-control software.',
      bullets: [
        'Designed and coded a working alpha of next-generation source-control software, writing the functional specifications and architecture for both the client and the server.',
        'Wrote the client and server communications and messaging systems, user-interface controls, and a pluggable system for controls, server commands, and localization data.',
        'Produced a working alpha with zero faults in the infrastructure: messaging, dynamic loading, and communications.',
      ],
    },
    // Leaving Wall Street On Demand for a startup
    {
      kind: 'milestone',
      date: '2001',
      text: 'I left Wall Street On Demand to try a three-person startup in Las Vegas.',
    },
    {
      kind: 'role',
      employer: 'Wall Street On Demand',
      title: 'Data Acquisition Engineer',
      collapsed: true,
      tech: ['C++', 'Lex', 'Yacc', 'COM', 'ADO', 'XML', 'XSL', 'SQL Server'],
      start: '2000',
      end: '2001',
      summary: 'Data feeds for financial web clients.',
      bullets: [
        'Built data-acquisition applications for financial web clients including Goldman Sachs, TheStreet.com, and First Call.',
        'Led the engineering of the Goldman Sachs website, using a data-driven XML framework to halve development time.',
        'Built a COM infrastructure and a data-driven framework for rapid development of XML feed consumers.',
      ],
    },
    {
      kind: 'education',
      credential: 'Associate of Arts',
      school: 'Rogue Community College',
      start: '1996',
      end: '1998',
    },
  ] satisfies TimelineEvent[],
}

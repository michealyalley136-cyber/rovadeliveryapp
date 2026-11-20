import Link from "next/link";
import { HeroSlideshow } from "@/components/hero-slideshow";

const services = [
  ["01", "ROVA Ride", "Motorcycle passenger transportation.", "MOTORCYCLE_RIDER"],
  ["02", "ROVA Taxi", "Car-based transportation.", "TAXI_DRIVER"],
  ["03", "ROVA Delivery", "Local packages and delivery services.", "DELIVERY_PARTNER"],
  ["04", "ROVA Food", "Restaurants and food delivery.", "MERCHANT"],
] as const;

const opportunities = [
  { icon: "↗", title: "Motorcycle Rider", text: "Explore passenger rides and future delivery opportunities.", type: "MOTORCYCLE_RIDER", action: "Apply as rider" },
  { icon: "⌑", title: "Taxi Driver", text: "Register your interest in driving with the future ROVA network.", type: "TAXI_DRIVER", action: "Apply as driver" },
  { icon: "⇢", title: "Delivery Partner", text: "Help local businesses and people move what matters.", type: "DELIVERY_PARTNER", action: "Apply for delivery" },
  { icon: "◉", title: "Need a Vehicle?", text: "Tell us what access you need to explore an opportunity.", type: "VEHICLE_ACCESS", action: "Apply for vehicle access" },
  { icon: "◌", title: "Restaurant / Merchant", text: "Bring your food business into the future ROVA marketplace.", type: "MERCHANT", action: "Register interest" },
  { icon: "▤", title: "Fleet Owner", text: "Explore placing vehicles with a growing mobility network.", type: "FLEET_OWNER", action: "Join as fleet partner" },
  { icon: "◇", title: "Vehicle Dealer", text: "Discuss future rental and fleet partnerships with ROVA.", type: "VEHICLE_DEALER", action: "Partner with ROVA" },
  { icon: "✳", title: "Strategic Partner", text: "Build with us across finance, insurance, technology and more.", type: "STRATEGIC_PARTNER", action: "Start a conversation" },
];

const faqs = [
  ["What is ROVA?", "ROVA is building a Ghana-focused mobility and earning network connecting transportation, delivery, vehicle access, commerce and trusted partners through one technology platform."],
  ["Has ROVA launched yet?", "ROVA is currently pre-launch. Applications are an expression of interest and do not mean that transportation or delivery services are available to book."],
  ["Who can apply?", "People interested in riding, driving, delivery, vehicle access, local commerce, fleet partnerships and strategic partnerships can register interest."],
  ["Can I apply without owning a motorcycle or car?", "Yes. You can tell us that you need vehicle access. Any future access will depend on qualification, availability and partner approval; an application does not guarantee a vehicle."],
  ["Can restaurants apply?", "Yes. Restaurants, food vendors, bakeries, cafes and other local businesses can register interest in ROVA Food."],
  ["Where will ROVA operate?", "We are exploring opportunities across Ghana. Listing a city in an application does not mean ROVA services are currently available there."],
  ["When will applications be reviewed?", "The ROVA team will review applications as the initial network is prepared. We do not promise a specific review date or outcome."],
  ["Will applicants need training and documents?", "ROVA intends to require appropriate verification, training, licences, vehicle standards and agreements before any operator activation."],
];

export function MarketingSite() {
  return <main className="marketing-site">
    <HeroSlideshow />
    <section className="hero-transition" aria-labelledby="hero-transition-title">
      <div>
        <div className="section-kicker">YOUR NEXT MOVE</div>
        <h2 id="hero-transition-title">Ready to move with ROVA?</h2>
        <p>Whether you want to ride, drive, deliver, sell, supply vehicles or partner with us, there’s a place for you in the ROVA network.</p>
      </div>
      <div className="hero-transition-actions">
        <Link className="gold-button" href="/apply">Apply to Join ROVA <span>→</span></Link>
        <a className="hero-transition-secondary" href="#about">Explore ROVA <span>→</span></a>
      </div>
    </section>
    <section className="intro-section" id="about">
      <div className="intro-overline"><span>01 / THE ROVA IDEA</span><span>ROVA GHANA · PRE-LAUNCH</span></div>
      <div className="intro-grid"><div><div className="section-kicker">A NETWORK BUILT FOR GHANA</div><h2>More than<br />a <em>ride.</em></h2></div><div className="intro-copy"><h3>What is ROVA?</h3><p>ROVA is building a new mobility network for Ghana that connects transportation, delivery, earning opportunities, vehicle access and trusted partners through one technology platform.</p><p>We’re starting with people — and building the support, safety and opportunity around the journeys they make every day.</p><Link className="dark-link" href="/apply">Find your place in ROVA <span>→</span></Link></div></div>
      <div className="ecosystem-line"><span>PEOPLE</span><i>+</i><span>MOBILITY</span><i>+</i><span>COMMERCE</span><i>+</i><span>OPPORTUNITY</span></div>
    </section>
    <section className="service-section">
      <div className="section-header"><div><div className="section-kicker">ONE CONNECTED NETWORK</div><h2>Built for the way<br />Ghana <em>moves.</em></h2></div><p>Four connected services. One ambition: move people, businesses and opportunity forward.</p></div>
      <div className="future-grid">{services.map(([number, name, text, type]) => <article className="future-card" key={name}><span className="card-number">{number}</span><span className="coming-soon">COMING SOON</span><div className={`future-illustration illustration-${number}`}>{number === "01" ? "↗" : number === "02" ? "⌑" : number === "03" ? "⇢" : "◌"}</div><h3>{name}</h3><p>{text}</p><Link href={`/apply?type=${type}`}>Register interest <span>↗</span></Link></article>)}</div>
      <p className="prelaunch-note"><i /> ROVA is preparing for launch. Services are not currently available to book.</p>
    </section>
    <section className="growth-section">
      <div className="growth-art"><div className="growth-grid" /><div className="growth-orbit orbit-a" /><div className="growth-orbit orbit-b" /><div className="growth-orbit orbit-c" /><div className="growth-center"><span>R</span><small>THE ROVA NETWORK</small></div><span className="orbit-label label-person">PERSON</span><span className="orbit-label label-work">WORK</span><span className="orbit-label label-growth">GROWTH</span></div>
      <div className="growth-copy"><div className="section-kicker">THE ROVA DIFFERENCE</div><h2>More than<br />a platform.<br /><em>A path forward.</em></h2><p>Traditional platforms connect a driver and a vehicle to a trip. ROVA is building the infrastructure around the person, the vehicle and the opportunity.</p><div className="growth-steps">{["Verification", "Training", "Vehicle access", "ROVA platform", "Customers", "Earnings + growth"].map((item, index) => <div key={item}><span>{String(index + 1).padStart(2, "0")}</span><b>{item}</b>{index < 5 && <i>↓</i>}</div>)}</div><Link className="dark-link" href="/apply">Explore opportunities <span>→</span></Link></div>
    </section>
    <section className="opportunity-section" id="opportunities"><div className="opportunity-top"><div><div className="section-kicker">YOUR NEXT MOVE</div><h2>Find your opportunity<br />with <em>ROVA.</em></h2></div><p>Bring your experience, your ambition or your idea. Let’s start a conversation about what you could build with us.</p></div><div className="opportunity-grid">{opportunities.map((item, index) => <article className="opportunity-card" key={item.type}><div className="opportunity-icon">{item.icon}</div><span className="opportunity-index">0{index + 1}</span><h3>{item.title}</h3><p>{item.text}</p><Link href={`/apply?type=${item.type}`}>{item.action}<span>↗</span></Link></article>)}</div><div className="vehicle-disclaimer"><span>✳</span><p><strong>Need access to a vehicle?</strong> ROVA is developing relationships with suppliers, dealers and finance partners. Any access is subject to qualification, availability and partner terms. Applying does not guarantee a vehicle.</p><Link href="/apply?type=VEHICLE_ACCESS">Explore vehicle access <span>→</span></Link></div></section>
    <section className="ghardware-section" aria-labelledby="ghardware-title">
      <div className="section-kicker">COMMERCE AND DELIVERY</div>
      <h2 id="ghardware-title">GHARDWARE <em>+ ROVA</em></h2>
      <p>Explore GHARDWARE Ghana’s marketplace for building materials, tools and supplies, and its vision for delivery through ROVA.</p>
      <a className="dark-link" href="https://ghardware.com">Explore GHARDWARE <span>↗</span></a>
    </section>
    <section className="safety-section" id="safety"><div className="safety-heading"><div className="section-kicker">SAFETY IS HOW WE MOVE</div><h2>Trust isn’t an add-on.<br />It’s <em>the starting point.</em></h2><p>We’re designing ROVA around responsible operations and clear standards, from the first application to every future journey.</p></div><div className="safety-cards">{[["01","Verified operators","Identity, licence and eligibility checks are part of the planned onboarding process."],["02","Training","Safety and service learning are intended to be required before operator activation."],["03","Vehicle standards","Vehicle documents, condition and maintenance will support network readiness."],["04","Support","Dedicated support and escalation pathways are part of the operating plan."]].map(([number,title,copy])=><article key={number}><span>{number}</span><div><h3>{title}</h3><p>{copy}</p></div><i>↗</i></article>)}</div><div className="safety-caveat">These are planned ROVA standards. They are not yet operating services or a guarantee of launch features.</div></section>
    <section className="partner-section" id="partners"><div className="partner-copy"><div className="section-kicker">A NETWORK BUILT TOGETHER</div><h2>Help build Ghana’s<br />next mobility <em>network.</em></h2><p>We’re opening conversations with the people and organizations who can help shape what ROVA becomes.</p><Link className="gold-button" href="/apply?type=STRATEGIC_PARTNER">Become a ROVA partner <span>↗</span></Link></div><div className="partner-types">{["Vehicle suppliers","Banks & finance","Dealers","Insurance","Maintenance","Restaurants","Technology","Telecommunications"].map((item,index)=><div key={item}><span>0{index+1}</span>{item}<i>↗</i></div>)}</div></section>
    <section className="final-cta"><div className="final-cta-art" /><div className="section-kicker">GHANA, LET’S MOVE FORWARD</div><h2>Be part of what<br />comes <em>next.</em></h2><p>ROVA is building its first network now. Tell us where you’d like to fit in.</p><Link className="gold-button" href="/apply">Apply to join ROVA <span>↗</span></Link><small>PRE-LAUNCH · APPLICATIONS DO NOT GUARANTEE APPROVAL</small></section>
    <section className="faq-section" id="faq"><div className="section-kicker">GOOD QUESTIONS</div><div className="faq-heading"><h2>Before we <em>begin.</em></h2><p>A few things to know about ROVA’s pre-launch and what joining the network means.</p></div><div className="faq-list">{faqs.map(([question, answer])=><details key={question}><summary>{question}<span>+</span></summary><p>{answer}</p></details>)}</div></section>
    <footer className="marketing-footer"><div className="footer-main"><div><Link className="campaign-logo" href="/">ROVA<span>.</span></Link><p>Move. Deliver. Earn.<br />With ROVA.</p><span className="footer-prelaunch">GHANA · PRE-LAUNCH</span></div><div className="footer-links"><div><b>Explore</b><a href="#about">About ROVA</a><a href="#opportunities">Opportunities</a><a href="#safety">Safety</a><Link href="/apply">Applications</Link><Link href="/application-status">Check application status</Link></div><div><b>Join the network</b><Link href="/apply?type=MOTORCYCLE_RIDER">Riders</Link><Link href="/apply?type=TAXI_DRIVER">Drivers</Link><Link href="/apply?type=MERCHANT">Merchants</Link><Link href="/apply?type=STRATEGIC_PARTNER">Partners</Link></div><div><b>Information</b><a href="#faq">FAQs</a><Link href="/privacy">Privacy notice</Link><Link href="/apply?type=STRATEGIC_PARTNER">Contact ROVA</Link></div></div></div><div className="footer-bottom"><span>© ROVA Ghana. All rights reserved.</span><span>Building a network for people, work and opportunity.</span></div></footer>
  </main>;
}

import mongoose from "mongoose";
import { VocabularyWord } from "../models/vocabulary_word.model";
import { PracticeTopicVocabulary } from "../models/practice_topic_vocabulary.model";
import { CERFLevel } from "../models/topic_vocabulary.model";

// ===============================
// CONFIG
// ===============================

const MONGO_URI = "mongodb://localhost:27017/toeic-db-v2";

if (!MONGO_URI) {
  throw new Error("Missing MONGO_URI in environment variables");
}

/**
 * Có thể truyền SEED_USER_ID từ .env.
 * Nếu không có, script dùng ObjectId mặc định để seed local.
 */
const SEED_USER_ID =
  process.env.SEED_USER_ID || "69cbf1331525116705402331";

const createdBy = new mongoose.Types.ObjectId(SEED_USER_ID);

/**
 * Tạo URL trực tiếp tới media file thật của Wikimedia Commons.
 */
const commonsFile = (fileName: string) =>
  `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(
    fileName
  )}`;

// ===============================
// MAIN SEED FUNCTION
// ===============================

const seedPracticeTopicVocabulary = async () => {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("✅ MongoDB connected");

    /**
     * Nếu không muốn xóa data cũ khi seed,
     * hãy comment 2 dòng này lại.
     */
    await PracticeTopicVocabulary.deleteMany({});
    await VocabularyWord.deleteMany({});

    console.log("🧹 Old mock data cleared");

    // =========================================================
    // 1. CREATE VOCABULARY WORDS
    // =========================================================

    const vocabularyWords = await VocabularyWord.insertMany([
      // =====================================================
      // TOPIC 1: OFFICE & MEETINGS
      // =====================================================

      {
        word: "appointment",
        phonetic: "/əˈpɔɪntmənt/",
        type: "noun",
        definitions: [
          "A formal arrangement to meet or visit someone at a particular time.",
        ],
        hints: [
          "You usually make this with a doctor, client, or manager.",
          "It is a scheduled meeting or visit.",
        ],
        examples: [
          "I have an appointment with the dentist at 3 p.m.",
          "She scheduled an appointment with a new client.",
        ],
        image: commonsFile("Woman looking at an appointment book.jpg"),
        audio: commonsFile("En-us-appointment.ogg"),
        tags: ["office", "schedule", "meeting", "toeic-part-2"],
        level: "A2",
        part: "Part 2",
        notes:
          "Common in TOEIC conversations about schedules, visits, and customer service.",
      },

      {
        word: "meeting",
        phonetic: "/ˈmiːtɪŋ/",
        type: "noun",
        definitions: [
          "An occasion when people come together to discuss something.",
        ],
        hints: [
          "Employees attend this to discuss work.",
          "It may be held in a conference room.",
        ],
        examples: [
          "The meeting will begin at 10 a.m.",
          "We discussed the project during yesterday's meeting.",
        ],
        image: commonsFile("A meeting room at Government Office of Vietnam.jpg"),
        audio: commonsFile("En-us-meeting.ogg"),
        tags: ["office", "discussion", "teamwork", "toeic-part-3"],
        level: "A2",
        part: "Part 3",
        notes:
          "A foundational business-English word used in office contexts.",
      },

      {
        word: "schedule",
        phonetic: "/ˈskedʒuːl/",
        type: "noun",
        definitions: [
          "A plan that lists the times when events or tasks are expected to happen.",
        ],
        hints: [
          "Meetings, classes, and deliveries often follow this.",
          "It tells you what happens and when.",
        ],
        examples: [
          "Please check the updated training schedule.",
          "The delivery schedule changed because of bad weather.",
        ],
        image: commonsFile("WMDE Event Wall Calendar.jpg"),
        audio: commonsFile("En-us-schedule.ogg"),
        tags: ["calendar", "planning", "office", "toeic-part-4"],
        level: "A2",
        part: "Part 4",
        notes:
          "Frequently appears in announcements, emails, and workplace dialogues.",
      },

      {
        word: "manager",
        phonetic: "/ˈmænɪdʒər/",
        type: "noun",
        definitions: [
          "A person responsible for controlling or organizing part of a business.",
        ],
        hints: [
          "This person supervises employees.",
          "They may approve plans, reports, or requests.",
        ],
        examples: [
          "The manager approved the budget proposal.",
          "Please speak with the store manager.",
        ],
        image: commonsFile("Managers office (7467976074).jpg"),
        audio: commonsFile("En-us-manager.ogg"),
        tags: ["business", "staff", "leadership", "toeic-part-3"],
        level: "A2",
        part: "Part 3",
        notes:
          "Useful in office, retail, and recruitment-related TOEIC passages.",
      },

      {
        word: "office",
        phonetic: "/ˈɔːfɪs/",
        type: "noun",
        definitions: [
          "A room, building, or place where people work, usually at desks.",
        ],
        hints: [
          "Employees often work here.",
          "It may contain desks, computers, and meeting rooms.",
        ],
        examples: [
          "Our office is located on the fifth floor.",
          "She returned to the office after lunch.",
        ],
        image: commonsFile("Office Desk.jpg"),
        audio: commonsFile("En-us-office.ogg"),
        tags: ["workplace", "business", "building", "toeic-part-1"],
        level: "A1",
        part: "Part 1",
        notes:
          "A very common TOEIC noun, especially in Part 1 picture descriptions.",
      },

      // =====================================================
      // TOPIC 2: BUSINESS DOCUMENTS & FINANCE
      // =====================================================

      {
        word: "invoice",
        phonetic: "/ˈɪnvɔɪs/",
        type: "noun",
        definitions: [
          "A document showing the amount of money owed for goods or services.",
        ],
        hints: [
          "A company sends this when requesting payment.",
          "It often lists items, prices, and the total amount.",
        ],
        examples: [
          "The supplier emailed the invoice this morning.",
          "Please pay the invoice within 30 days.",
        ],
        image: commonsFile("Invoice.jpg"),
        audio: commonsFile("En-us-invoice.ogg"),
        tags: ["finance", "payment", "document", "toeic-part-7"],
        level: "B1",
        part: "Part 7",
        notes:
          "High-value vocabulary for business emails, purchase orders, and accounting.",
      },

      {
        word: "receipt",
        phonetic: "/rɪˈsiːt/",
        type: "noun",
        definitions: [
          "A document that proves something has been paid for.",
        ],
        hints: [
          "You receive this after buying something.",
          "It usually shows the amount paid.",
        ],
        examples: [
          "Please keep your receipt for future reference.",
          "The cashier printed a receipt after the payment.",
        ],
        image: commonsFile("Receipt.jpg"),
        audio: commonsFile("En-us-receipt.ogg"),
        tags: ["shopping", "finance", "document", "toeic-part-7"],
        level: "A2",
        part: "Part 7",
        notes:
          "Often appears in customer service, travel reimbursement, and retail contexts.",
      },

      {
        word: "contract",
        phonetic: "/ˈkɒntrækt/",
        type: "noun",
        definitions: [
          "A formal written agreement between two or more people or organizations.",
        ],
        hints: [
          "It may describe duties, payment, and legal terms.",
          "Employees, clients, and vendors may sign this.",
        ],
        examples: [
          "The company signed a new contract with the supplier.",
          "Please read the contract carefully before signing.",
        ],
        image: commonsFile("Legal Contract & Signature - Warm Tones.jpg"),
        audio: commonsFile("En-us-contract-noun.ogg"),
        tags: ["legal", "business", "agreement", "toeic-part-7"],
        level: "B1",
        part: "Part 7",
        notes:
          "Important in formal notices, employment offers, and vendor communications.",
      },

      {
        word: "report",
        phonetic: "/rɪˈpɔːrt/",
        type: "noun",
        definitions: [
          "A document that presents information about a particular subject.",
        ],
        hints: [
          "Managers and analysts often prepare this.",
          "It may summarize performance, results, or findings.",
        ],
        examples: [
          "The quarterly sales report will be presented tomorrow.",
          "She submitted the report before the deadline.",
        ],
        image: commonsFile("Whatagraph report template.jpg"),
        audio: commonsFile("En-us-report.ogg"),
        tags: ["document", "analysis", "office", "toeic-part-5"],
        level: "A2",
        part: "Part 5",
        notes:
          "Common in office emails and test questions about deadlines or submissions.",
      },

      {
        word: "payment",
        phonetic: "/ˈpeɪmənt/",
        type: "noun",
        definitions: [
          "An amount of money paid or the act of paying money.",
        ],
        hints: [
          "Customers make this after buying products or services.",
          "It can be made by cash, card, or bank transfer.",
        ],
        examples: [
          "Your payment has been successfully processed.",
          "The company requires payment before shipment.",
        ],
        image: commonsFile("Payment terminal at self-checkout.jpg"),
        audio: commonsFile("En-us-payment.ogg"),
        tags: ["finance", "shopping", "invoice", "toeic-part-7"],
        level: "A2",
        part: "Part 7",
        notes:
          "Useful in billing notices, invoices, and customer-support messages.",
      },

      // =====================================================
      // TOPIC 3: TRAVEL & FRONT DESK
      // =====================================================

      {
        word: "hotel",
        phonetic: "/həʊˈtel/",
        type: "noun",
        definitions: [
          "A place where people pay to stay for a short time.",
        ],
        hints: [
          "Travelers sleep here during trips.",
          "It may offer rooms, breakfast, and reception services.",
        ],
        examples: [
          "The hotel offers complimentary breakfast.",
          "We checked into the hotel at 2 p.m.",
        ],
        image: commonsFile("Hotel lobby.jpg"),
        audio: commonsFile("En-us-hotel.ogg"),
        tags: ["travel", "accommodation", "service", "toeic-part-3"],
        level: "A1",
        part: "Part 3",
        notes:
          "Very common in TOEIC listening passages about reservations and travel.",
      },

      {
        word: "reception",
        phonetic: "/rɪˈsepʃən/",
        type: "noun",
        definitions: [
          "The front desk or area in a hotel, office, or building where visitors are received.",
        ],
        hints: [
          "Guests often ask questions here.",
          "You may check in at this place in a hotel.",
        ],
        examples: [
          "Please leave your room key at reception.",
          "The visitor asked for directions at the reception desk.",
        ],
        image: commonsFile("Reception desk with a computer at a restaurant.JPG"),
        audio: commonsFile("En-us-reception.ogg"),
        tags: ["hotel", "front-desk", "visitor", "toeic-part-3"],
        level: "B1",
        part: "Part 3",
        notes:
          "Useful for service-related and travel-related TOEIC conversations.",
      },

      {
        word: "passenger",
        phonetic: "/ˈpæsɪndʒər/",
        type: "noun",
        definitions: [
          "A person traveling in a vehicle, plane, train, or ship, but not driving it.",
        ],
        hints: [
          "Airports, buses, and trains have these people.",
          "This word is common in travel announcements.",
        ],
        examples: [
          "Passengers should proceed to Gate 12.",
          "The train can carry more than 500 passengers.",
        ],
        image: commonsFile("Passenger at airport.jpg"),
        audio: commonsFile("En-us-passenger.ogg"),
        tags: ["airport", "transport", "travel", "toeic-part-4"],
        level: "A2",
        part: "Part 4",
        notes:
          "Appears frequently in public announcements and transit notices.",
      },

      {
        word: "departure",
        phonetic: "/dɪˈpɑːrtʃər/",
        type: "noun",
        definitions: [
          "The act of leaving a place, especially at the start of a journey.",
        ],
        hints: [
          "The opposite is arrival.",
          "Airports display this on flight boards.",
        ],
        examples: [
          "The flight's departure has been delayed.",
          "Please arrive at the station 20 minutes before departure.",
        ],
        image: commonsFile("Departures board Danang Airport.JPG"),
        audio: commonsFile("En-us-departure.ogg"),
        tags: ["airport", "schedule", "travel", "toeic-part-4"],
        level: "B1",
        part: "Part 4",
        notes:
          "A common announcement word in TOEIC listening.",
      },

      {
        word: "arrival",
        phonetic: "/əˈraɪvəl/",
        type: "noun",
        definitions: [
          "The act of reaching a destination.",
        ],
        hints: [
          "The opposite is departure.",
          "Hotels and airports often mention expected times for this.",
        ],
        examples: [
          "The estimated arrival time is 6:45 p.m.",
          "Guests should confirm their arrival date in advance.",
        ],
        image: commonsFile("Departure board at Geneva Airport.jpg"),
        audio: commonsFile("En-us-arrival.ogg"),
        tags: ["travel", "airport", "timing", "toeic-part-4"],
        level: "B1",
        part: "Part 4",
        notes:
          "Useful in schedules, booking confirmations, and public announcements.",
      },

      // =====================================================
      // TOPIC 4: WORK, HR & CLIENT RELATIONS
      // =====================================================

      {
        word: "employee",
        phonetic: "/ɪmˈplɔɪiː/",
        type: "noun",
        definitions: [
          "A person who works for a company or organization.",
        ],
        hints: [
          "This person receives wages or a salary.",
          "Companies may train or evaluate them.",
        ],
        examples: [
          "Every employee must wear an identification badge.",
          "The company hired three new employees this month.",
        ],
        image: commonsFile("Employees discuss in office.jpg"),
        audio: commonsFile("En-us-employee.ogg"),
        tags: ["work", "staff", "company", "toeic-part-5"],
        level: "A2",
        part: "Part 5",
        notes:
          "Very common in HR notices, workplace policies, and company communications.",
      },

      {
        word: "interview",
        phonetic: "/ˈɪntərvjuː/",
        type: "noun",
        definitions: [
          "A formal meeting in which someone is asked questions to determine their suitability for a job or role.",
        ],
        hints: [
          "Job applicants attend this.",
          "A recruiter or manager usually asks the questions.",
        ],
        examples: [
          "Her job interview is scheduled for Monday.",
          "The manager interviewed five candidates.",
        ],
        image: commonsFile("Employment Law Office.jpg"),
        audio: commonsFile("En-us-interview.ogg"),
        tags: ["recruitment", "job", "candidate", "toeic-part-3"],
        level: "B1",
        part: "Part 3",
        notes:
          "Frequently appears in hiring and appointment contexts.",
      },

      {
        word: "training",
        phonetic: "/ˈtreɪnɪŋ/",
        type: "noun",
        definitions: [
          "The process of learning skills needed for a job or activity.",
        ],
        hints: [
          "New employees often receive this.",
          "It may happen in a classroom or workshop.",
        ],
        examples: [
          "All new employees must complete safety training.",
          "The training session will begin at 9 a.m.",
        ],
        image: commonsFile("Training Room.jpg"),
        audio: commonsFile("En-us-training.ogg"),
        tags: ["employee", "skills", "workshop", "toeic-part-4"],
        level: "A2",
        part: "Part 4",
        notes:
          "Common in internal announcements and staff-development messages.",
      },

      {
        word: "project",
        phonetic: "/ˈprɒdʒekt/",
        type: "noun",
        definitions: [
          "A planned piece of work designed to achieve a particular goal.",
        ],
        hints: [
          "Teams work on this over time.",
          "It usually has a deadline and tasks.",
        ],
        examples: [
          "The software project will be completed next quarter.",
          "She is leading a new marketing project.",
        ],
        image: commonsFile("Project planning with in-Step.jpg"),
        audio: commonsFile("En-us-project.ogg"),
        tags: ["planning", "teamwork", "deadline", "toeic-part-5"],
        level: "A2",
        part: "Part 5",
        notes:
          "A useful word across many business and office TOEIC passages.",
      },

      {
        word: "client",
        phonetic: "/ˈklaɪənt/",
        type: "noun",
        definitions: [
          "A person or organization that receives services from a business or professional.",
        ],
        hints: [
          "Lawyers, designers, and agencies work with these people.",
          "This word is similar to customer but often more professional.",
        ],
        examples: [
          "We will present the proposal to the client tomorrow.",
          "The consultant spoke with an important client.",
        ],
        image: commonsFile(
          'Meeting in Yokneam "How to Win Contracts and Influence Clients" 04.JPG'
        ),
        audio: commonsFile("En-us-client.ogg"),
        tags: ["business", "service", "professional", "toeic-part-3"],
        level: "B1",
        part: "Part 3",
        notes:
          "Common in business discussions, presentations, and email exchanges.",
      },

      // =====================================================
      // TOPIC 5: RETAIL, SALES & OPERATIONS
      // =====================================================

      {
        word: "order",
        phonetic: "/ˈɔːrdər/",
        type: "noun",
        definitions: [
          "A request to buy or receive goods or services.",
        ],
        hints: [
          "Customers place this when purchasing something.",
          "It may be tracked, shipped, or canceled.",
        ],
        examples: [
          "Your order will be shipped tomorrow.",
          "The restaurant received a large lunch order.",
        ],
        image: commonsFile("Food delivery driver delivering online order.jpg"),
        audio: commonsFile("En-us-order.ogg"),
        tags: ["shopping", "delivery", "customer", "toeic-part-7"],
        level: "A2",
        part: "Part 7",
        notes:
          "Very useful in online shopping, restaurant, and supply contexts.",
      },

      {
        word: "product",
        phonetic: "/ˈprɒdʌkt/",
        type: "noun",
        definitions: [
          "Something that is made or sold by a company.",
        ],
        hints: [
          "Companies advertise and sell this.",
          "It may be physical or digital.",
        ],
        examples: [
          "The company launched a new product last week.",
          "Customers gave positive reviews of the product.",
        ],
        image: commonsFile("Sample Product Receipt.jpg"),
        audio: commonsFile("En-us-product.ogg"),
        tags: ["sales", "business", "retail", "toeic-part-5"],
        level: "A2",
        part: "Part 5",
        notes:
          "Common in advertisements, product descriptions, and customer feedback.",
      },

      {
        word: "market",
        phonetic: "/ˈmɑːrkɪt/",
        type: "noun",
        definitions: [
          "A place or system where goods and services are bought and sold.",
        ],
        hints: [
          "It can mean a physical place or a business sector.",
          "Companies study this before launching products.",
        ],
        examples: [
          "The company plans to enter the Asian market.",
          "Fresh vegetables are sold at the local market.",
        ],
        image: commonsFile('"The Toy Seller".jpg'),
        audio: commonsFile("En-us-market.ogg"),
        tags: ["sales", "business", "retail", "toeic-part-6"],
        level: "A2",
        part: "Part 6",
        notes:
          "Useful in both everyday shopping and business strategy contexts.",
      },

      {
        word: "discount",
        phonetic: "/ˈdɪskaʊnt/",
        type: "noun",
        definitions: [
          "A reduction in the usual price of something.",
        ],
        hints: [
          "Stores offer this during promotions.",
          "It means customers pay less than usual.",
        ],
        examples: [
          "Customers receive a 20 percent discount this weekend.",
          "The hotel offers a discount for early bookings.",
        ],
        image: commonsFile("Sale sign.jpg"),
        audio: commonsFile("En-us-discount.ogg"),
        tags: ["promotion", "retail", "price", "toeic-part-7"],
        level: "A2",
        part: "Part 7",
        notes:
          "Frequently appears in advertisements, coupons, and sales announcements.",
      },

      {
        word: "equipment",
        phonetic: "/ɪˈkwɪpmənt/",
        type: "noun",
        definitions: [
          "The tools, machines, or objects needed for a particular purpose.",
        ],
        hints: [
          "Offices, factories, and laboratories use this.",
          "It may require repair or maintenance.",
        ],
        examples: [
          "The company purchased new office equipment.",
          "Safety equipment must be inspected regularly.",
        ],
        image: commonsFile(
          "Equipment and tools in a fire engine in intervention in Brussels 02.jpg"
        ),
        audio: commonsFile("En-us-equipment.ogg"),
        tags: ["tools", "operations", "maintenance", "toeic-part-4"],
        level: "B1",
        part: "Part 4",
        notes:
          "Common in announcements about maintenance, purchasing, and workplace safety.",
      },
    ]);

    console.log(`✅ Inserted ${vocabularyWords.length} vocabulary words`);

    // =========================================================
    // 2. BUILD WORD ID MAP
    // =========================================================

    const wordMap = new Map(
      vocabularyWords.map((word) => [word.word, word._id])
    );

    const getWordIds = (words: string[]) =>
      words.map((word) => {
        const id = wordMap.get(word);

        if (!id) {
          throw new Error(`Missing vocabulary word id for: ${word}`);
        }

        return id;
      });

    // =========================================================
    // 3. CREATE PRACTICE TOPICS
    // =========================================================

    const practiceTopics = await PracticeTopicVocabulary.insertMany([
      {
        title: "Office & Meetings",
        description:
          "Bộ từ vựng nền tảng về môi trường công sở, lịch làm việc và các buổi họp.",
        tags: ["office", "meeting", "schedule", "workplace"],
        level: CERFLevel.A2,
        part_type: 3,
        vocabulary_words: getWordIds([
          "appointment",
          "meeting",
          "schedule",
          "manager",
          "office",
        ]),
        created_by: createdBy,
      },

      {
        title: "Business Documents & Finance",
        description:
          "Bộ từ thường gặp trong hóa đơn, chứng từ, báo cáo và thanh toán.",
        tags: ["finance", "documents", "payment", "business"],
        level: CERFLevel.B1,
        part_type: 7,
        vocabulary_words: getWordIds([
          "invoice",
          "receipt",
          "contract",
          "report",
          "payment",
        ]),
        created_by: createdBy,
      },

      {
        title: "Travel & Front Desk",
        description:
          "Bộ từ vựng thường xuất hiện trong khách sạn, sân bay và các thông báo di chuyển.",
        tags: ["travel", "hotel", "airport", "announcement"],
        level: CERFLevel.A2,
        part_type: 4,
        vocabulary_words: getWordIds([
          "hotel",
          "reception",
          "passenger",
          "departure",
          "arrival",
        ]),
        created_by: createdBy,
      },

      {
        title: "Work, HR & Client Relations",
        description:
          "Bộ từ liên quan đến nhân sự, đào tạo, dự án và làm việc với khách hàng.",
        tags: ["hr", "employee", "client", "project"],
        level: CERFLevel.B1,
        part_type: 3,
        vocabulary_words: getWordIds([
          "employee",
          "interview",
          "training",
          "project",
          "client",
        ]),
        created_by: createdBy,
      },

      {
        title: "Retail, Sales & Operations",
        description:
          "Bộ từ xoay quanh đơn hàng, sản phẩm, thị trường, giảm giá và thiết bị.",
        tags: ["retail", "sales", "operations", "shopping"],
        level: CERFLevel.A2,
        part_type: 7,
        vocabulary_words: getWordIds([
          "order",
          "product",
          "market",
          "discount",
          "equipment",
        ]),
        created_by: createdBy,
      },
    ]);

    console.log(`✅ Inserted ${practiceTopics.length} practice topics`);

    console.log("🎉 Seed practice topic vocabulary completed successfully");
  } catch (error) {
    console.error("❌ Seed failed:", error);
  } finally {
    await mongoose.disconnect();
    console.log("🔌 MongoDB disconnected");
  }
};

seedPracticeTopicVocabulary();
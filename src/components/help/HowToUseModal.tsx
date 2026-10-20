import React, { useState } from 'react';
import { Modal } from '../common/Modal';
import { ActiveTab } from '../layout/BottomNav';
import {
  Landmark,
  TrendingUp,
  Receipt,
  FileSpreadsheet,
  ShieldCheck,
  ArrowRight,
  CheckCircle2,
  BookOpen,
  Smartphone,
} from 'lucide-react';

interface HowToUseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigateTab: (tab: ActiveTab) => void;
}

export const HowToUseModal: React.FC<HowToUseModalProps> = ({
  isOpen,
  onClose,
  onNavigateTab,
}) => {
  const [activeSection, setActiveSection] = useState<'workflow' | 'brs' | 'audit' | 'install'>('workflow');

  const steps = [
    {
      number: '01',
      title: 'የባንክ ሂሳቦችዎን በመጀመሪያ ይመዝግቡ (Add Bank Accounts)',
      tab: 'bank' as ActiveTab,
      tabLabel: 'ወደ ባንክ ክፍል ይሂዱ',
      icon: Landmark,
      description:
        'በመጀመሪያ የንግድ ባንክ ሂሳቦችዎን (ለምሳሌ፦ የኢትዮጵያ ንግድ ባንክ (CBE) ወይም አዋሽ ባንክ) እና አሁን በባንክ ያለዎትን ቀሪ ሂሳብ በብር (ETB) ይመዝግቡ።',
      tips: [
        'ሽያጭ ወይም ግዢ በባንክ ዝውውር (Bank Transfer) ሲፈጽሙ መተግበሪያው የባንክ ቀሪ ሂሳብዎን በራሱ ያስተካክላል።',
        'ከደንበኞች የሚሰበሰበውን 15% ተ.እ.ታ (VAT) ለብቻው ለማስቀመጥ የታክስ ቁጠባ (Tax Savings Account) መጠቀም ይችላሉ።',
      ],
    },
    {
      number: '02',
      title: 'የዕለት አጠቃላይ ሽያጭ (Record Daily Sales) እና የማታ ገንዘብ ቆጠራ',
      tab: 'sales' as ActiveTab,
      tabLabel: 'ወደ ሽያጭ ክፍል ይሂዱ',
      icon: TrendingUp,
      description:
        'እያንዳንዱን ዕቃ በተናጠል መመዝገብ አያስፈልግም። በቀኑ መጨረሻ "Record Daily Sales" የሚለውን በመጫን የቀኑን አጠቃላይ የሽያጭ ድምር በብር (ETB) በአንድ ጊዜ ብቻ ያስገቡ።',
      tips: [
        'ያስገቡት የዕለት ሽያጭ 15% ተ.እ.ታ (VAT)ን ያካተተ (Includes 15% VAT) ወይም ያላካተተ መሆኑን ይምረጡ፤ መተግበሪያው ታክሱን በራሱ ያሰላል።',
        'በቀኑ መጨረሻ "End-of-Day Cash Count" የሚለውን በመጫን በሱቅ ካዝና ውስጥ ያለውን ጥሬ ገንዘብ ቆጥረው ልዩነት አለመኖሩን ያረጋግጡ።',
      ],
    },
    {
      number: '03',
      title: 'የዕቃ ግዢዎችን እና የሱቅ ወጪዎችን ይመዝግቡ (Purchases & Expenses)',
      tab: 'purchases' as ActiveTab,
      tabLabel: 'ወደ ግዢ ክፍል ይሂዱ',
      icon: Receipt,
      description:
        'ከፋብሪካ ወይም ከጅምላ አከፋፋዮች ዕቃ (ሲሚንቶ፣ ብረት፣ ቀለም) ሲገዙ እንዲሁም የሱቅ ወጪዎችን (ትራንስፖርት፣ መብራት፣ የሱቅ ኪራይ) ሲከፍሉ "Add Purchase / Expense" የሚለውን በመጫን የአቅራቢውን ስም እና የደረሰኝ ቁጥር ያስገቡ።',
      tips: [
        'ህጋዊ የግዢ ደረሰኞችን መመዝገብ በግዢ ወቅት የከፈሉትን 15% ተ.እ.ታ (VAT Paid) እንዲቀነስልዎት እና የሚከፍሉትን የትርፍ ግብር እንዲቀንስ ይረዳዎታል።',
        'የወረቀት ደረሰኙ እንዳይጠፋ በስልክዎ ፎቶ አንስተው ማያያዝ ይችላሉ።',
      ],
    },
    {
      number: '04',
      title: 'የባንክ ስቴትመንት እና የሱቅ መዝገብ ማመሳከሪያ (Bank Balance Check)',
      tab: 'bank' as ActiveTab,
      tabLabel: 'ወደ ባንክ ማመሳከሪያ ይሂዱ',
      icon: FileSpreadsheet,
      description:
        'ከባንክ ወርሃዊ ስቴትመንት (Bank Statement) ሲደርስዎት "Bank & Balance Check" ክፍል ውስጥ በመግባት የባንክ ወረቀቱን ቀሪ ሂሳብ ከሱቅዎ መዝገብ ጋር ያመሳክሩ።',
      tips: [
        'ወደ ባንክ ልከው ገና ስቴትመንት ላይ ያልታየ ገንዘብ ካለ "Add Pending Deposit" በሚለው ይጨምሩ።',
        'ለአቅራቢ የሰጡት ነገር ግን ገና ያልተመነዘረ ቼክ ካለ "Add Uncashed Cheque" በሚለው ይቀንሱ።',
        'የባንክ አገልግሎት ክፍያዎችን (Bank Fees) "Save to App" በማለት ወደ መዝገብዎ ያስገቡ።',
      ],
    },
    {
      number: '05',
      title: 'የትርፍ እና የግብር ማጠቃለያ ይመልከቱ (Tax & Profit Check)',
      tab: 'audit' as ActiveTab,
      tabLabel: 'ወደ ግብር ማጠቃለያ ይሂዱ',
      icon: ShieldCheck,
      description:
        '"Tax & Profit Check" ክፍልን በመክፈት የሱቅዎን የተጣራ ትርፍ፣ የሚጠበቅብዎትን የትርፍ ግብር እና የተጣራ የተ.እ.ታ (VAT) ክፍያ በቀላሉ ይመልከቱ።',
      tips: [
        'ለሂሳብ ባለሙያ ወይም ለገቢዎች ቢሮ የሚቀርብ ሪፖርት ለማውጣት "Print Tax Report" ወይም "Download Report" የሚለውን ይጫኑ።',
      ],
    },
  ];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="የመተግበሪያው አጠቃቀም መመሪያ (How to Use)"
      subtitle="የሰለሞን ህንፃ መሳሪያዎች መደብር — የዕለት ሽያጭ፣ ግዢ፣ የባንክ ማስታረቂያ እና የታክስ ኦዲት መመሪያ"
      maxWidth="max-w-2xl"
    >
      <div className="space-y-5">
        {/* Sub-navigation tabs inside the guide */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 p-1 rounded-xl bg-stone-100 border border-stone-200">
          <button
            type="button"
            onClick={() => setActiveSection('workflow')}
            className={`py-2 px-2 rounded-lg text-xs font-semibold transition text-center ${
              activeSection === 'workflow'
                ? 'bg-white text-stone-900 shadow-sm'
                : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            1. 5ቱ ደረጃዎች
          </button>
          <button
            type="button"
            onClick={() => setActiveSection('brs')}
            className={`py-2 px-2 rounded-lg text-xs font-semibold transition text-center ${
              activeSection === 'brs'
                ? 'bg-white text-stone-900 shadow-sm'
                : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            2. ባንክ ማስታረቂያ
          </button>
          <button
            type="button"
            onClick={() => setActiveSection('audit')}
            className={`py-2 px-2 rounded-lg text-xs font-semibold transition text-center ${
              activeSection === 'audit'
                ? 'bg-white text-stone-900 shadow-sm'
                : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            3. የታክስ ህጎች
          </button>
          <button
            type="button"
            onClick={() => setActiveSection('install')}
            className={`py-2 px-2 rounded-lg text-xs font-semibold transition text-center ${
              activeSection === 'install'
                ? 'bg-white text-orange-900 shadow-sm border border-stone-200'
                : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            4. በስልክ መጫኛ (App)
          </button>
        </div>

        {activeSection === 'workflow' && (
          <div className="space-y-3.5">
            {steps.map((step) => {
              const Icon = step.icon;
              return (
                <div
                  key={step.number}
                  className="p-4 rounded-2xl bg-stone-50 border border-stone-200 space-y-2.5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <span className="w-7 h-7 rounded-lg bg-orange-700 text-white font-mono text-xs font-bold flex items-center justify-center shrink-0">
                        {step.number}
                      </span>
                      <h3 className="text-sm font-bold text-stone-900 flex items-center gap-1.5">
                        <Icon className="w-4 h-4 text-orange-700 shrink-0" />
                        <span>{step.title}</span>
                      </h3>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        onNavigateTab(step.tab);
                        onClose();
                      }}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white border border-stone-300 text-stone-800 text-xs font-semibold hover:bg-stone-100 transition whitespace-nowrap shrink-0"
                    >
                      <span>{step.tabLabel}</span>
                      <ArrowRight className="w-3 h-3 text-orange-700" />
                    </button>
                  </div>

                  <p className="text-xs text-stone-700 leading-relaxed">
                    {step.description}
                  </p>

                  <ul className="space-y-1 pt-1">
                    {step.tips.map((tip, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-xs text-stone-600">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700 shrink-0 mt-0.5" />
                        <span>{tip}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}

        {activeSection === 'brs' && (
          <div className="space-y-4 text-xs text-stone-700">
            <div className="p-4 rounded-2xl bg-stone-50 border border-stone-200 space-y-2">
              <h3 className="text-sm font-bold text-stone-900">
                የባንክ ማስታረቂያ መግለጫ (Bank Reconciliation Statement - BRS) እንዴት ይሰራል?
              </h3>
              <p className="leading-relaxed">
                በወሩ መጨረሻ ላይ በሱቅዎ መዝገብ (Cash Book) ላይ ያለው ቀሪ ሂሳብ እና ከባንክ የሚሰጥዎት ስቴትመንት (Bank Statement) በጊዜ ልዩነት ምክንያት ላይመሳሰሉ ይችላሉ። የባንክ ማስታረቂያ (BRS) ሁለቱንም ሂሳቦች በማስተካከል ትክክለኛነቱን ያረጋግጣል።
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="p-4 rounded-2xl bg-white border border-stone-200 space-y-2">
                <span className="text-xs font-bold uppercase tracking-wider text-orange-700 block">
                  ክፍል 1፦ የባንክ ስቴትመንት ወገን (Bank Side)
                </span>
                <p className="font-semibold text-stone-900">
                  ቀመር፦ የባንክ ስቴትመንት ቀሪ ሂሳብ + በመንገድ ላይ ያለ ተቀማጭ − ያልተመነዘሩ ቼኮች = የተስተካከለ የባንክ ሂሳብ
                </p>
                <ul className="space-y-1.5 text-stone-600 pt-1">
                  <li>
                    <strong>• የባንክ ስቴትመንት ቀሪ ሂሳብ (Ending Statement Balance)፦</strong> ከባንክ በተሰጠዎት ወረቀት ላይ ያለውን የመጨረሻ ሂሳብ ያስገቡ።
                  </li>
                  <li>
                    <strong>• ሲደመር በመንገድ ላይ ያለ ተቀማጭ (Deposits in Transit)፦</strong> ወደ ባንክ ያስገቡት ነገር ግን ስቴትመንቱ ላይ ገና ያልታየ ገንዘብ።
                  </li>
                  <li>
                    <strong>• ሲቀነስ ያልተመነዘሩ ቼኮች (Outstanding Cheques)፦</strong> ለአቅራቢዎች የሰጧቸው ነገር ግን ከባንክ ገና ያልተቀነሱ ቼኮች።
                  </li>
                </ul>
              </div>

              <div className="p-4 rounded-2xl bg-white border border-stone-200 space-y-2">
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-700 block">
                  ክፍል 2፦ የሱቅ መዝገብ ወገን (Cash Book Side)
                </span>
                <p className="font-semibold text-stone-900">
                  ቀመር፦ የመዝገብ ቀሪ ሂሳብ + ያልተመዘገቡ የባንክ ገቢዎች − የባንክ አገልግሎት ክፍያዎች = የተስተካከለ የመዝገብ ሂሳብ
                </p>
                <ul className="space-y-1.5 text-stone-600 pt-1">
                  <li>
                    <strong>• የመዝገብ ቀሪ ሂሳብ (Unadjusted Book Balance)፦</strong> በመተግበሪያው ውስጥ ከተመዘገቡ ሽያጮችና ግዢዎች በራሱ የሚመጣ።
                  </li>
                  <li>
                    <strong>• ሲደመር ያልተመዘገቡ የባንክ ገቢዎች (Unrecorded Credits)፦</strong> ደንበኞች በቀጥታ ወደ ባንክ ያስገቡት ወይም የባንክ ወለድ።
                  </li>
                  <li>
                    <strong>• ሲቀነስ የባንክ ክፍያዎች (Bank Charges / NSF)፦</strong> የRTGS ኮሚሽን፣ የአገልግሎት ክፍያ ወይም የተመለሱ (NSF) ቼኮች።
                  </li>
                </ul>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-950 space-y-1">
              <span className="font-bold block">ማስታረቂያው መቼ ተጠናቀቀ ይባላል?</span>
              <p>
                <strong>የተስተካከለው የባንክ ሂሳብ (Adjusted Bank Balance)</strong> እና <strong>የተስተካከለው የመዝገብ ሂሳብ (Adjusted Book Balance)</strong> እኩል ሲሆኑ (ልዩነት / Variance = ETB 0.00)። በመጨረሻም <strong>&quot;Certify &amp; Save BRS Record&quot;</strong> የሚለውን በመጫን ለኦዲት ማስረጃነት ያስቀምጡ።
              </p>
            </div>
          </div>
        )}

        {activeSection === 'audit' && (
          <div className="space-y-3.5 text-xs text-stone-700">
            <div className="p-4 rounded-2xl bg-stone-50 border border-stone-200 space-y-2">
              <h3 className="text-sm font-bold text-stone-900 flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-orange-700" />
                <span>በታክስ ኦዲት ወቅት ከቅጣትና ከስህተት የሚጠብቁ 4 ወሳኝ ህጎች</span>
              </h3>
              <p className="leading-relaxed">
                በታክስ ኦዲት ወቅት ቅጣት የሚመጣው ወደ ባንክ የገባው ገንዘብ ከተመዘገበው ሽያጭ ሲበልጥ ወይም ለወጪዎች ህጋዊ ደረሰኝ ሳይኖር ሲቀር ነው። እነዚህን 4 ነጥቦች ሁልጊዜ ይተግብሩ፦
              </p>
            </div>

            <div className="space-y-2.5">
              <div className="p-3.5 rounded-xl bg-white border border-stone-200">
                <h4 className="font-bold text-stone-900">1. ማንኛውም የባንክ ገቢ ምክንያቱና ደረሰኙ መታወቅ አለበት</h4>
                <p className="text-stone-600 mt-0.5">
                  በባንክ ስቴትመንት ላይ የሚታይ ማንኛውም ገቢ ከሽያጭ ደረሰኝ ጋር ካልተያያዘ በኦዲተሮች ዘንድ እንደ ተደበቀ የሽያጭ ገቢ ይቆጠራል። ስለዚህ በ<strong>Bank Feed</strong> ውስጥ ሁሉንም የባንክ ገቢዎች ከሽያጭ ደረሰኞች ጋር ያዛምዱ (Match ያድርጉ)።
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-white border border-stone-200">
                <h4 className="font-bold text-stone-900">2. ለእያንዳንዱ ግዢ ህጋዊ የአቅራቢ ደረሰኝ ቁጥር (Invoice #) ይመዝግቡ</h4>
                <p className="text-stone-600 mt-0.5">
                  የገዙትን ሲሚንቶ፣ ብረት ወይም የትራንስፖርት ወጪ ከትርፍ ግብር ላይ ለመቀነስ እና የከፈሉትን 15% ተ.እ.ታ (Input VAT) ለማካካስ የአቅራቢውን ህጋዊ ደረሰኝ ቁጥር እና ፎቶ በ<strong>Purchases</strong> ክፍል ውስጥ ያስቀምጡ።
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-white border border-stone-200">
                <h4 className="font-bold text-stone-900">3. የዕለት ጥሬ ገንዘብ ቆጠራ (Daily Z-Report) በየቀኑ ይዝጉ</h4>
                <p className="text-stone-600 mt-0.5">
                  በየቀኑ ማታ ካዝናዎን ቆጥረው <strong>Close Day (Z-Report)</strong> ማድረግ በእጅዎ ያለው ጥሬ ገንዘብ ከተቆረጡት ደረሰኞች ጋር ትክክል መሆኑን ያረጋግጣል።
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-white border border-stone-200">
                <h4 className="font-bold text-stone-900">4. የተሰበሰበውን 15% ተ.እ.ታ (VAT) ወደ ታክስ መጠባበቂያ ሂሳብ ያዛውሩ</h4>
                <p className="text-stone-600 mt-0.5">
                  ከደንበኞች የሚሰበሰበው 15% VAT የመንግስት አደራ ገንዘብ ስለሆነ ለስራ ማስኬጃ እንዳይውል በ<strong>Tax Reserve Transfer</strong> አማካኝነት ወደ ተለየ የባንክ ሂሳብ ያስቀምጡ።
                </p>
              </div>
            </div>
          </div>
        )}

        {activeSection === 'install' && (
          <div className="space-y-3.5 text-xs text-stone-700">
            <div className="p-4 rounded-2xl bg-orange-50 border border-orange-200 space-y-2">
              <h3 className="text-sm font-bold text-stone-900 flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-orange-700" />
                <span>በስልክዎ መነሻ ገጽ (Home Screen) ላይ እንደ መተግበሪያ መጫኛ</span>
              </h3>
              <p className="leading-relaxed">
                የዌብ አድራሻ ሳይተይቡ ልክ እንደ ተለመደው የሞባይል አፕሊኬሽን በቀጥታ ከስልክዎ ወይም ታብሌትዎ መነሻ ገጽ ላይ በ1 ንክኪ ለመክፈት የሚከተሉትን ቀላል ደረጃዎች ይከተሉ፦
              </p>
            </div>

            <div className="space-y-2.5">
              <div className="p-3.5 rounded-xl bg-white border border-stone-200 space-y-1.5">
                <h4 className="font-bold text-stone-900 text-sm">ለአንድሮይድ ስልኮች (Android / Chrome / Samsung Internet)፦</h4>
                <ol className="list-decimal pl-4 space-y-1 text-stone-600">
                  <li>በስክሪኑ ላይኛው ክፍል ያለውን <strong>&quot;Add to Home Screen&quot;</strong> ወይም <strong>&quot;Install App&quot;</strong> የሚለውን ይጫኑ።</li>
                  <li>ወይም በChrome ማሰሻው ከላይ በስተቀኝ ያሉትን <strong>ሶስት ነጥቦች (⋮)</strong> ይንኩ።</li>
                  <li><strong>&quot;Add to Home screen&quot;</strong> ወይም <strong>&quot;Install application&quot;</strong> የሚለውን ይምረጡ።</li>
                  <li><strong>&quot;Install&quot;</strong> የሚለውን ያረጋግጡ — የTaxGuard አርማ በስልክዎ ስክሪን ላይ ይቀመጣል!</li>
                </ol>
              </div>

              <div className="p-3.5 rounded-xl bg-white border border-stone-200 space-y-1.5">
                <h4 className="font-bold text-stone-900 text-sm">ለአይፎን እና አይፓድ (iPhone &amp; iPad / Safari)፦</h4>
                <ol className="list-decimal pl-4 space-y-1 text-stone-600">
                  <li>ገጹን በ<strong>Safari</strong> ማሰሻ ይክፈቱት።</li>
                  <li>ከስር ያለውን የ<strong>Share (ማጋሪያ) ምልክት (ካሬ ከቀስት ጋር)</strong> ይንኩ።</li>
                  <li>ወደ ታች ዝቅ ብለው <strong>&quot;Add to Home Screen&quot;</strong> የሚለውን ይምረጡ።</li>
                  <li>ከላይ በስተቀኝ <strong>&quot;Add&quot;</strong> የሚለውን ይጫኑ — አፑ በስልክዎ ላይ ተጭኖ ያለ ብራውዘር አድራሻ ይከፈታል!</li>
                </ol>
              </div>

              <div className="p-3 rounded-xl bg-stone-50 border border-stone-200 text-stone-600">
                <p>
                  💡 <strong>ጥቅሙ፦</strong> የዌብ አድራሻ መተየብ አያስፈልግም፣ ኢንተርኔት በሌለበት ሰዓትም (Offline) ይሰራል፣ እና ልክ እንደ ፕሌይ ስቶር አፕ ሙሉ ስክሪን ይከፈታል።
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="pt-3 border-t border-stone-200 flex items-center justify-between">
          <span className="text-xs text-stone-500">
            ሁሉም መረጃዎች በዚህ ስልክ/ኮምፒውተር ላይ በብር (ETB) በራሳቸው ይቀመጣሉ።
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-stone-900 text-white text-xs font-semibold hover:bg-stone-800 transition"
          >
            ተረድቻለሁ፣ መጠቀም ጀምር
          </button>
        </div>
      </div>
    </Modal>
  );
};

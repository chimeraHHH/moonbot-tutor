const topics = {
  sun: {
    kicker: "太阳 | 羲和体系",
    title: "羲和·太阳天火课堂",
    tag: "预生成叙事",
    intro:
      "从羲和驭日到古人定时序，再到羲和卫星观测太阳，星燧把神话、古天文与现代航天串成一条可学习的光路。",
    myth: "羲和驾着太阳车巡行天空，让人类第一次把昼夜、光明与秩序连在一起。",
    ancient: "古人观日影、定节气、识农时，把太阳变化转化为生活与礼乐的时间尺度。",
    space: "羲和号卫星把太阳活动转化为可观测数据，让古老的观日传统进入现代科学仪器。",
    frames: [
      "画面：太阳车从东方升起，光线照亮篝火与地平线。",
      "画面：日影长度变化被标成节气刻度，形成古人理解时间的模型。",
      "画面：羲和卫星观测数据浮现，完成从神话到科学观测的转场。",
    ],
  },
  moon: {
    kicker: "月球 | 望舒体系",
    title: "望舒·月轮文脉课堂",
    tag: "预生成叙事",
    intro:
      "月亮不只是夜空的银盘，它连接了月神传说、月相变化、诗词记忆和嫦娥探月工程。",
    myth: "望舒御月、嫦娥奔月、玉兔捣药，把月亮变成中国人最柔软的宇宙想象。",
    ancient: "月相周期帮助古人理解朔望、月份与节令，也沉淀为中秋、诗词和生活节奏。",
    space: "嫦娥工程把奔月想象带入真实探测，让古老故事抵达月壤、影像与科学样本。",
    frames: [
      "画面：银白月轮升起，嫦娥与玉兔的剪影在月面一闪而过。",
      "画面：新月、上弦、满月、下弦依次展开，形成月相循环。",
      "画面：嫦娥探测器轨迹接入月面影像，显示神话如何落地为工程。",
    ],
  },
  mars: {
    kicker: "火星 | 祝融体系",
    title: "祝融·星火火星课堂",
    tag: "核心主推",
    intro:
      "从燧人取火、祝融司火，到古人称火星为荧惑，再到祝融号火星车，火成为文明传承与深空探索的共同符号。",
    myth: "燧人取火让人类拥有光明，祝融司火让火从生存工具成为文明、秩序与教化的象征。",
    ancient: "火星色赤、运行轨迹变化明显，古人称其为荧惑，并把它视为需要认真观测的天象。",
    space: "祝融号火星车登陆乌托邦平原，把古代火神之名带到真实火星地貌之上。",
    frames: [
      "画面：一簇火从黑暗中升起，祝融的赤色纹样与火星表面重叠。",
      "画面：荧惑在星图中逆行，轨迹被标注成古人观察到的异常运动。",
      "画面：祝融号沿火星地貌前进，旁白解释巡视探测任务。",
    ],
  },
  earth: {
    kicker: "地球 | 大地体系",
    title: "厚土·大地家园课堂",
    tag: "预生成叙事",
    intro:
      "从女娲补天、共工触山到古人测量九州，地球是中国神话与古地理学的共同舞台。",
    myth: "女娲补天、共工触倒不周山，古人以神话解释地形与天地格局，把大地想象成有故事的宇宙中心。",
    ancient: "古人以土圭测日影、划分九州，把大地理解为可丈量、可治理的家园与历法根基。",
    space: "中国对地观测卫星让古人的大地想象进入精准遥感影像时代，俯瞰这颗蓝色星球。",
    frames: [
      "画面：女娲补天，五色石熔化填补苍穹裂缝，大地重归稳定。",
      "画面：古人以土圭测日影，九州地图徐徐展开。",
      "画面：卫星俯瞰地球，蓝色星球轮廓清晰可见。",
    ],
  },
  chanye: {
    kicker: "嫦娥工程 | 月球探测",
    title: "嫦娥探月技术解析",
    tag: "工程原理",
    intro:
      "从地月转移轨道到月面软着陆，再到钻取采样与样本封装返回，嫦娥工程每一步都在解决真实的物理约束。",
    history: "2007年嫦娥一号首次绕月成功；2013年嫦娥三号完成软着陆，玉兔号月球车工作972天；2019年嫦娥四号落月背面，成为全球首次；2020年12月17日，嫦娥五号将1731克月壤带回地球，中国由此成为继美苏之后第三个掌握月球采样返回技术的国家，距人类上次取样已时隔44年。2024年嫦娥六号更完成人类首次月球背面采样返回。",
    historyFrame: "节点：2007绕月 → 2013软着陆 → 2019月背 → 2020采样返回1731g → 2024月背采样",
    myth: "地月转移采用霍曼转移轨道，在最优发射窗口点火将探测器送入大椭圆轨道；近月制动利用发动机反推使探测器被月球引力捕获，进入近圆环月轨道，整个过程飞行约5天。",
    ancient: "软着陆分为主减速、快速调整、缓速下降与悬停避障四段。嫦娥五号以可变推力发动机配合激光雷达实时扫描地形，将垂直速度降至接近零后完成触月；钻取月壤深度2米，样品封装于双层容器后由上升器返回。",
    labels: ["00 技术历程", "01 轨道力学", "02 软着陆与采样"],
    frames: [
      "要点：发射窗口约每月一次，地月距离约38万公里，近月制动误差需控制在秒级。",
      "要点：悬停高度约100米，避障雷达分辨率达厘米级，确保选取平坦着陆区。",
      "",
    ],
  },
  rocket: {
    kicker: "航天技术 | 火箭回收",
    title: "可回收火箭技术解析",
    tag: "工程原理",
    intro:
      "垂直回收火箭依靠精确的气动控制与推进减速，在数分钟内完成从超音速再入到精确软着陆的全过程。",
    history: "2023年12月，双曲线二号完成国内首次可重复使用火箭飞行验证。2024年9月，朱雀三号完成10公里级垂直起降试验，着陆偏差仅1.7米。2026年7月10日，长征十号乙运载火箭在海南首飞，一子级通过领航者号回收船上的网系捕获方式成功回收——中国由此成为全球第二个掌握大运力可回收火箭技术的国家，同时也是全球首个实现运载火箭网系回收的国家。",
    historyFrame: "节点：2023双曲线首飞 → 2024朱雀10km试验 → 2026.7.10长征十号乙首飞暨首次成功回收（网系捕获）",
    myth: "一子级分离后，栅格舵展开提供气动控制，调整再入姿态；发动机分别完成再入燃烧与着陆燃烧两个关键减速段，将速度从每秒数千米降至接近零，全程依赖实时推力矢量调节维持姿态稳定。",
    ancient: "末端着陆依靠惯性导航与GPS组合定位，精度达米级；着陆腿在触地前展开，内置蜂窝铝缓冲结构吸收剩余冲击能量，确保箭体结构完整，具备快速检测后复飞的能力。",
    labels: ["00 技术历程", "01 大气减速控制", "02 精确着陆系统"],
    frames: [
      "要点：栅格舵面积大、阻力可控，是超音速段姿态控制的关键气动面。",
      "要点：发动机深度节流比可达10:1，是实现低推力悬停着陆的核心能力。",
      "",
    ],
  },
  stars: {
    kicker: "星河星宿 | 伏羲体系",
    title: "星燧·星河星宿共学课堂",
    tag: "共学模式",
    intro:
      "伏羲观星画卦、二十八星宿与银河传说共同构成古人的天空地图，也能被转译成可探索的星图课堂。",
    myth: "伏羲仰观天象、俯察地理，把星空秩序转化为理解世界的符号系统。",
    ancient: "二十八星宿帮助古人划分天空、记录季节，也让夜空成为可命名、可讲述的文明地图。",
    space: "空间站与深空观测让今天的人类继续在星河中定位自身，延续观星传统。",
    frames: [
      "画面：篝火旁的人群抬头观星，星点连成伏羲观象的图案。",
      "画面：二十八星宿沿天区展开，变成可点击的星图结构。",
      "画面：空间站视角切入地球边缘与星云，连接古今观测。",
    ],
  },
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const DEFAULT_LABELS = ["01 神话之火", "02 古天文之象"];

function setTopic(topicKey) {
  const topic = topics[topicKey];
  $("#topicKicker").textContent = topic.kicker;
  $("#topicTitle").textContent = topic.title;
  $("#topicTag").textContent = topic.tag;
  $("#topicIntro").textContent = topic.intro;
  $("#mythText").textContent = topic.myth;
  $("#ancientText").textContent = topic.ancient;
  $("#mythFrame").textContent = topic.frames[0];
  $("#ancientFrame").textContent = topic.frames[1];
  const historyCard = $("#historyCard");
  const chain = $("#knowledgeChain");
  if (topic.history) {
    historyCard.style.display = "";
    chain.classList.remove("two-card");
    $("#label0").textContent = (topic.labels && topic.labels[0]) || "00 技术历程";
    $("#historyText").textContent = topic.history;
    $("#historyFrame").textContent = topic.historyFrame || "";
    $("#label1").textContent = (topic.labels && topic.labels[1]) || DEFAULT_LABELS[0];
    $("#label2").textContent = (topic.labels && topic.labels[2]) || DEFAULT_LABELS[1];
  } else {
    historyCard.style.display = "none";
    chain.classList.add("two-card");
    const labels = topic.labels || DEFAULT_LABELS;
    $("#label1").textContent = labels[0];
    $("#label2").textContent = labels[1];
  }
  $$(`[data-topic]`).forEach((button) => {
    button.classList.toggle("active", button.dataset.topic === topicKey);
  });
}

function openLesson(topicKey) {
  setTopic(topicKey);
  $("#zhixiangView").classList.add("hidden");
  $("#homeView").classList.add("hidden");
  $("#aerospaceView").classList.add("hidden");
  $("#pricingView").classList.add("hidden");
  $("#lessonView").classList.remove("hidden");
  $("#resultPanel").classList.add("hidden");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function backHome() {
  $("#lessonView").classList.add("hidden");
  $("#zhixiangView").classList.remove("hidden");
  $("#homeView").classList.remove("hidden");
  $("#aerospaceView").classList.remove("hidden");
  $("#pricingView").classList.remove("hidden");
  $("#" + lastSection).scrollIntoView({ behavior: "smooth" });
}

function buildGeneratedResult(question) {
  const lower = question.toLowerCase();
  const isMars = question.includes("火星") || question.includes("荧惑") || question.includes("祝融");
  const isMoon = question.includes("月") || question.includes("嫦娥") || question.includes("中秋");
  const isSun = question.includes("太阳") || question.includes("羲和") || question.includes("日");
  const topic = isMars ? "mars" : isMoon ? "moon" : isSun ? "sun" : lower ? "stars" : "mars";
  const topicData = topics[topic];

  return {
    topic,
    title: question || "为什么古人把火星叫荧惑？",
    myth: `可以先从「${topicData.kicker}」里的神话意象讲起，用一个故事把问题变成可进入的场景。`,
    ancient: "再把故事里的天象还原为古人真实观察到的现象，解释名称、周期、方位或运动变化。",
  };
}

function showGeneratedResult(question) {
  const result = buildGeneratedResult(question);
  setTopic(result.topic);
  $("#resultTitle").textContent = result.title;
  $("#resultMyth").textContent = result.myth;
  $("#resultAncient").textContent = result.ancient;  $("#resultPanel").classList.remove("hidden");
  $("#resultPanel").scrollIntoView({ behavior: "smooth", block: "nearest" });
}

const PAGES = ["zhixiangView", "homeView", "aerospaceView", "pricingView"];
let currentPage = 0;
let lastSection = "homeView";

$$(`[data-topic]`).forEach((button) => {
  button.addEventListener("click", () => {
    const parentSection = button.closest("section");
    if (parentSection && PAGES.includes(parentSection.id)) {
      lastSection = parentSection.id;
      currentPage = PAGES.indexOf(parentSection.id);
    }
    openLesson(button.dataset.topic);
  });
});

$("#backHome").addEventListener("click", backHome);

$("#scrollToSolar").addEventListener("click", () => {
  currentPage = 1;
  $("#homeView").scrollIntoView({ behavior: "smooth" });
});

document.addEventListener("keydown", (e) => {
  if (!$("#lessonView").classList.contains("hidden")) return;
  if (e.key === "ArrowDown") {
    e.preventDefault();
    currentPage = Math.min(currentPage + 1, PAGES.length - 1);
    $("#" + PAGES[currentPage]).scrollIntoView({ behavior: "smooth" });
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    currentPage = Math.max(currentPage - 1, 0);
    $("#" + PAGES[currentPage]).scrollIntoView({ behavior: "smooth" });
  }
});

$("#askForm").addEventListener("submit", (event) => {
  event.preventDefault();
  showGeneratedResult($("#questionInput").value.trim());
});

setTopic("sun");



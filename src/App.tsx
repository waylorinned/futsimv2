import { useState, useCallback, useEffect, useRef } from 'react';

// ==================== TYPES ====================
type Position = 'Нападающий' | 'Полузащитник' | 'Защитник' | 'Вратарь';
type Screen = 'create' | 'story' | 'dashboard' | 'match' | 'matchEnd' | 'training' | 'seasonEnd';

interface Skills {
  pace: number; shooting: number; passing: number;
  dribbling: number; defending: number; physical: number;
}

interface Player {
  name: string; position: Position; number: number; skills: Skills;
  xp: number; goals: number; assists: number; totalMatches: number; trainingCount: number;
}

interface MatchOption {
  text: string; stars: number; skill: keyof Skills; difficulty: number;
  successXp: number; skillGrowth: number; resultText: string; failText: string;
}

interface MatchEvent { minute: number; text: string; options: MatchOption[]; }

interface MatchState {
  events: MatchEvent[]; currentEvent: number; homeScore: number; awayScore: number;
  log: string[]; goalsScored: number; assistsMade: number; xpEarned: number;
  rivalTeam: string;
}

interface TransferOffer { name: string; league: string; level: number; }

// ==================== CONSTANTS ====================
const CAREER_PATH: { level: number; name: string; league: string; teams: string[]; minRating: number }[] = [
  { level: 0, name: 'Двор', league: 'Уличные матчи', teams: ['Дворовая команда'], minRating: 0 },
  { level: 1, name: 'Академия', league: 'Молодёжная лига', teams: ['Академия Спартака', 'Академия Динамо', 'Академия Зенита', 'Академия ЦСКА'], minRating: 0 },
  { level: 2, name: '3-й дивизион', league: 'Нижняя проф. лига', teams: ['ФК Район', 'Городской ФК', 'Местный СК'], minRating: 0 },
  { level: 3, name: '2-й дивизион', league: 'Второй дивизион', teams: ['Спартак-2', 'Динамо-2', 'Торпедо', 'Крылья Советов'], minRating: 50 },
  { level: 4, name: '1-й дивизион', league: 'Премьер-Лига', teams: ['Локомотив', 'ЦСКА', 'Зенит', 'Краснодар', 'Ростов'], minRating: 65 },
  { level: 5, name: 'Элитный дивизион', league: 'Мировая лига', teams: ['Реал Мадрид', 'Барселона', 'Манчестер Сити', 'Бавария', 'ПСЖ', 'Ювентус', 'Ливерпуль', 'Интер'], minRating: 80 },
];

const MATCHES_PER_SEASON = 6;
const MATCHES_BETWEEN_TRAINING = 2;

const POSITION_SKILLS: Record<Position, Skills> = {
  'Нападающий': { pace: 55, shooting: 60, passing: 40, dribbling: 55, defending: 20, physical: 45 },
  'Полузащитник': { pace: 50, shooting: 45, passing: 60, dribbling: 55, defending: 35, physical: 45 },
  'Защитник': { pace: 45, shooting: 30, passing: 50, dribbling: 40, defending: 60, physical: 55 },
  'Вратарь': { pace: 35, shooting: 20, passing: 40, dribbling: 25, defending: 60, physical: 50 },
};

// ==================== HELPERS ====================
function getRating(s: Skills): number {
  return Math.round(Object.values(s).reduce((a, b) => a + b, 0) / 6);
}

function getRatingColor(r: number): string {
  if (r >= 80) return 'text-yellow-400';
  if (r >= 65) return 'text-green-400';
  if (r >= 50) return 'text-blue-400';
  if (r >= 35) return 'text-gray-400';
  return 'text-red-400';
}

function getBarColor(v: number): string {
  if (v >= 80) return 'bg-yellow-400';
  if (v >= 65) return 'bg-green-400';
  if (v >= 50) return 'bg-blue-400';
  if (v >= 35) return 'bg-gray-400';
  return 'bg-red-400';
}

function pickRival(level: number, myTeamName: string): string {
  const cd = CAREER_PATH[level];
  if (!cd || cd.teams.length === 0) return 'Соперник';
  const pool = cd.teams.filter(t => t !== myTeamName);
  if (pool.length === 0) return cd.teams[Math.floor(Math.random() * cd.teams.length)];
  return pool[Math.floor(Math.random() * pool.length)];
}

function getTeamName(level: number): string {
  const cd = CAREER_PATH[level];
  if (!cd) return 'Команда';
  return cd.name;
}

// ==================== MATCH EVENTS ====================
function generateEvents(_position: Position): MatchEvent[] {
  const allEvents: { text: string; options: MatchOption[] }[] = [
    {
      text: 'Ты прорываешься по флангу, а впереди уже идут защитники. Что выберешь?',
      options: [
        { text: '⭐️⭐️⭐️⭐️ Радуга и обводка', stars: 4, skill: 'dribbling', difficulty: 70, successXp: 25, skillGrowth: 3, resultText: 'Невероятно! Радуга прошла! Ты на рандеву с вратарём!', failText: 'Не получилось... Мяч улетел в аут.' },
        { text: '⭐️⭐️ Навес в штрафную', stars: 2, skill: 'passing', difficulty: 40, successXp: 15, skillGrowth: 1, resultText: 'Отличный навес! Партнёр бьёт!', failText: 'Навес ушёл далеко от партнёра.' },
        { text: '⭐️⭐️⭐️ Пробить издали', stars: 3, skill: 'shooting', difficulty: 60, successXp: 20, skillGrowth: 2, resultText: 'Удар в дальнюю девятку! ГОЛ!!!', failText: 'Удар прошёл мимо ворот.' },
      ],
    },
    {
      text: 'Тебе отдают мяч в центре поля, ты видишь открывшегося партнёра.',
      options: [
        { text: '⭐️ Короткий пас', stars: 1, skill: 'passing', difficulty: 25, successXp: 10, skillGrowth: 1, resultText: 'Хороший простой пас. Игра продолжается.', failText: 'Пас неточный. Соперник перехватил.' },
        { text: '⭐️⭐️⭐️ Дриблинг через центр', stars: 3, skill: 'dribbling', difficulty: 55, successXp: 20, skillGrowth: 2, resultText: 'Ты прошёл двух защитников и вышел на ударную!', failText: 'Защитник прочитал. Мяч потерян.' },
        { text: '⭐️⭐️ Длинный перевод', stars: 2, skill: 'passing', difficulty: 45, successXp: 15, skillGrowth: 1, resultText: 'Отличный перевод фланга! Команда в атаке!', failText: 'Перевод перехвачен.' },
      ],
    },
    {
      text: 'Соперник проводит контратаку! Как действуешь?',
      options: [
        { text: '⭐️⭐️ Вступить в отбор', stars: 2, skill: 'defending', difficulty: 40, successXp: 15, skillGrowth: 1, resultText: 'Отличный отбор! Мяч у тебя.', failText: 'Промазал. Соперник выходит один на один...' },
        { text: '⭐️⭐️⭐️ Сыграть на опережение', stars: 3, skill: 'pace', difficulty: 55, successXp: 20, skillGrowth: 2, resultText: 'Ты успел первым! Какая реакция!', failText: 'Не успел. Соперник бьёт...' },
        { text: '⭐️ Вернуться в позицию', stars: 1, skill: 'physical', difficulty: 25, successXp: 10, skillGrowth: 1, resultText: 'Правильно занял позицию, атака захлебнулась.', failText: 'Не успел вернуться.' },
      ],
    },
    {
      text: 'Мяч на подступах к штрафной соперника. Твои действия?',
      options: [
        { text: '⭐️⭐️⭐️⭐️ Удар через себя!', stars: 4, skill: 'shooting', difficulty: 75, successXp: 30, skillGrowth: 3, resultText: 'НЕВЕРОЯТНО! Удар через себя — В ДЕВЯТКУ!', failText: 'Попытка не удалась. Мяч над перекладиной.' },
        { text: '⭐️⭐️ Разрезающая передача', stars: 2, skill: 'passing', difficulty: 40, successXp: 15, skillGrowth: 1, resultText: 'Гениальный пас! Партнёр бьёт!', failText: 'Передача перехвачена.' },
        { text: '⭐️⭐️⭐️ Обвести и пробить', stars: 3, skill: 'dribbling', difficulty: 55, successXp: 20, skillGrowth: 2, resultText: 'Обвёл одного, второго... Удар! ГОЛ!', failText: 'Обводка не удалась.' },
      ],
    },
    {
      text: 'Стандартное положение — штрафной в опасной зоне.',
      options: [
        { text: '⭐️⭐️ Удар в створ', stars: 2, skill: 'shooting', difficulty: 45, successXp: 15, skillGrowth: 1, resultText: 'Хороший удар! Вратарь на угловой.', failText: 'Удар в стенку.' },
        { text: '⭐️ Навес на ближнюю', stars: 1, skill: 'passing', difficulty: 30, successXp: 10, skillGrowth: 1, resultText: 'Хороший навес! Партнёр бьёт головой!', failText: 'Навес слабый. Вратарь забрал.' },
        { text: '⭐️⭐️⭐️ Розыгрыш', stars: 3, skill: 'passing', difficulty: 55, successXp: 20, skillGrowth: 2, resultText: 'Гениальный розыгрыш! Один на один — ГОЛ!', failText: 'Розыгрыш не удался.' },
      ],
    },
    {
      text: 'Ты получаешь мяч в своей штрафной. Соперник давит!',
      options: [
        { text: '⭐️ Выбить подальше', stars: 1, skill: 'physical', difficulty: 25, successXp: 10, skillGrowth: 1, resultText: 'Мяч далеко. Опасность миновала.', failText: 'Неточный вынос. Соперник снова давит.' },
        { text: '⭐️⭐️ Начать атаку пасом', stars: 2, skill: 'passing', difficulty: 40, successXp: 15, skillGrowth: 1, resultText: 'Точный пас. Атака начинается!', failText: 'Пас перехвачен у своих ворот.' },
        { text: '⭐️⭐️⭐️ Выход с мячом', stars: 3, skill: 'dribbling', difficulty: 60, successXp: 20, skillGrowth: 2, resultText: 'Обвёл нападающего и начал атаку!', failText: 'Потерял мяч в штрафной!' },
      ],
    },
    {
      text: 'Последние минуты матча. Счёт равный. Ты с мячом.',
      options: [
        { text: '⭐️⭐️⭐️ Взять игру на себя!', stars: 3, skill: 'shooting', difficulty: 60, successXp: 25, skillGrowth: 2, resultText: 'Ты рвёшь оборону и забиваешь победный!!!', failText: 'Удар заблокирован. Ничья.' },
        { text: '⭐️⭐️ Пас под удар', stars: 2, skill: 'passing', difficulty: 40, successXp: 15, skillGrowth: 1, resultText: 'Отдал на свободного — ГОЛ! Победа!', failText: 'Передача неточная. Момент потерян.' },
        { text: '⭐️ Сохранить мяч', stars: 1, skill: 'physical', difficulty: 25, successXp: 10, skillGrowth: 1, resultText: 'Мудрое решение. Время уходит.', failText: 'Мяч потерян. Соперник давит.' },
      ],
    },
  ];

  const count = 4 + Math.floor(Math.random() * 2);
  const selected = [...allEvents].sort(() => Math.random() - 0.5).slice(0, count);
  selected.sort((a, b) => Math.min(...a.options.map(o => o.stars)) - Math.min(...b.options.map(o => o.stars)));

  return selected.map((ev, i) => ({
    minute: Math.min(5 + i * Math.floor(85 / count) + Math.floor(Math.random() * 5), 89),
    text: ev.text,
    options: ev.options.map(o => ({ ...o })),
  }));
}

// ==================== STORY DATA ====================
const STORY_TEXTS: Record<string, { title: string; lines: string[] }> = {
  yard_start: {
    title: '🏙️ Всё начинается с двора',
    lines: [
      'Ты — обычный пацан с района. Каждый вечер после школы ты бежишь на свой двор.',
      'Здесь, между ржавыми гаражами и разбитым асфальтом, ты оттачиваешь свои навыки.',
      'Ворота из двух курток. Мяч — если повезёт — резиновый. Но ты играешь как будто это финал Лиги Чемпионов.',
      'Соседские пацаны зовут тебя "Месси". Может быть, когда-нибудь это станет правдой...',
      '🔥 Сезон уличных матчей начинается!',
    ],
  },
  academy_invite: {
    title: '🏟️ Тебя заметили!',
    lines: [
      'После одного из дворовых матчей к тебе подошёл мужчина в костюме.',
      '"Слушай, парень, я скаут футбольной академии. Ты играешь огонь. Хочешь попробовать у нас?"',
      'Ты не мог поверить своим ушам. Это шанс всей твоей жизни.',
      'На следующий день ты приехал на просмотр. Показал всё, что умеешь.',
      '✅ ТЕБЯ ВЗЯЛИ В АКАДЕМИЮ! Начинается новая глава!',
    ],
  },
  pro_debut: {
    title: '⚡ Ты в профессиональном футболе!',
    lines: [
      'Сезон в академии пролетел. Тренировки, матчи, работа над собой.',
      'Главный тренер вызвал тебя: "Ты готов. Ты переходишь в основу."',
      'Твоё сердце замирает. Профессиональный контракт. Вот оно.',
      'Теперь путь начинается по-настоящему. От двора до вершины.',
      'Вперёд! 🚀',
    ],
  },
};

// ==================== LOCAL STORAGE ====================
const SAVE_KEY = 'fc_save_v3';

function saveToStorage(data: object) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); } catch { /* silent */ }
}

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* silent */ }
  return null;
}

// ==================== MAIN APP ====================
export default function App() {
  // Load save once at mount
  const initialSave = useRef(loadFromStorage());

  const [screen, setScreen] = useState<Screen>(initialSave.current ? 'dashboard' : 'create');
  const [player, setPlayer] = useState<Player | null>(initialSave.current?.player ?? null);
  const [createForm, setCreateForm] = useState({ name: '', position: 'Нападающий' as Position });

  const [season, setSeason] = useState(initialSave.current?.season ?? 1);
  const [careerLevel, setCareerLevel] = useState(initialSave.current?.careerLevel ?? 0);
  const [matchesPlayed, setMatchesPlayed] = useState(initialSave.current?.matchesPlayed ?? 0);
  const [matchesUntilTraining, setMatchesUntilTraining] = useState(initialSave.current?.matchesUntilTraining ?? MATCHES_BETWEEN_TRAINING);
  const [seasonComplete, setSeasonComplete] = useState(initialSave.current?.seasonComplete ?? false);

  const [matchState, setMatchState] = useState<MatchState | null>(null);
  const [selectedChoice, setSelectedChoice] = useState<number | null>(null);
  const [choiceResult, setChoiceResult] = useState<{ success: boolean } | null>(null);

  const [trainingSkills, setTrainingSkills] = useState<Skills>({ pace: 0, shooting: 0, passing: 0, dribbling: 0, defending: 0, physical: 0 });
  const [trainingPointsLeft, setTrainingPointsLeft] = useState(0);

  const [transferOffers, setTransferOffers] = useState<TransferOffer[]>(initialSave.current?.transferOffers ?? []);
  const [newNumber, setNewNumber] = useState<number | null>(initialSave.current?.newNumber ?? null);
  const [storyKey, setStoryKey] = useState('');

  const [seasonStats, setSeasonStats] = useState(initialSave.current?.seasonStats ?? { goals: 0, assists: 0, matches: 0 });
  const [notification, setNotification] = useState('');

  // Auto-save whenever game state changes (but not during active match/training)
  useEffect(() => {
    if (player && screen !== 'match' && screen !== 'training') {
      saveToStorage({
        player, season, careerLevel, matchesPlayed, matchesUntilTraining,
        seasonComplete, seasonStats, transferOffers, newNumber,
      });
    }
  }, [player, season, careerLevel, matchesPlayed, matchesUntilTraining, seasonComplete, seasonStats, transferOffers, newNumber, screen]);

  const notify = useCallback((msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(''), 3000);
  }, []);

  // --- CREATE PLAYER ---
  const createPlayer = () => {
    if (!createForm.name.trim()) return;
    const base = { ...POSITION_SKILLS[createForm.position] };
    const keys = Object.keys(base) as (keyof Skills)[];
    keys.forEach(k => { base[k] = Math.max(10, Math.min(90, base[k] + Math.floor(Math.random() * 11) - 5)); });

    const p: Player = {
      name: createForm.name.trim(), position: createForm.position,
      number: Math.floor(Math.random() * 99) + 1,
      skills: base, xp: 0, goals: 0, assists: 0, totalMatches: 0, trainingCount: 0,
    };
    setPlayer(p);
    setCareerLevel(0); setSeason(1); setMatchesPlayed(0);
    setMatchesUntilTraining(MATCHES_BETWEEN_TRAINING);
    setSeasonComplete(false); setTransferOffers([]); setNewNumber(null);
    setSeasonStats({ goals: 0, assists: 0, matches: 0 });
    setStoryKey('yard_start'); setScreen('story');
  };

  // --- STORY ADVANCE ---
  const storyNext = () => {
    if (storyKey === 'academy_invite') {
      setCareerLevel(1); setSeason(2); setMatchesPlayed(0);
      setMatchesUntilTraining(MATCHES_BETWEEN_TRAINING);
      setPlayer(prev => prev ? { ...prev, number: Math.floor(Math.random() * 99) + 1 } : null);
      setSeasonStats({ goals: 0, assists: 0, matches: 0 });
    } else if (storyKey === 'pro_debut') {
      setCareerLevel(2); setSeason(3); setMatchesPlayed(0);
      setMatchesUntilTraining(MATCHES_BETWEEN_TRAINING);
      setPlayer(prev => prev ? { ...prev, number: Math.floor(Math.random() * 99) + 1 } : null);
      setSeasonStats({ goals: 0, assists: 0, matches: 0 });
    }
    setStoryKey(''); setSeasonComplete(false);
    setScreen('dashboard');
  };

  // --- START MATCH ---
  const startMatch = () => {
    if (!player) return;
    const myTeam = getTeamName(careerLevel);
    const rival = pickRival(careerLevel, myTeam);
    setMatchState({
      events: generateEvents(player.position),
      currentEvent: 0, homeScore: 0, awayScore: 0,
      log: [`⚽ МАТЧ: ${myTeam} vs ${rival}`, `#${player.number} ${player.name} | ${player.position}`, ''],
      goalsScored: 0, assistsMade: 0, xpEarned: 0, rivalTeam: rival,
    });
    setSelectedChoice(null); setChoiceResult(null);
    setScreen('match');
  };

  // --- MAKE CHOICE IN MATCH ---
  const makeChoice = (optIdx: number) => {
    if (!matchState || !player) return;
    const ev = matchState.events[matchState.currentEvent];
    const opt = ev.options[optIdx];
    const skillVal = player.skills[opt.skill];
    const success = Math.random() * 100 < (100 - (opt.difficulty - (skillVal - 50) * 0.5));

    const log = [...matchState.log];
    let home = matchState.homeScore;
    let away = matchState.awayScore;
    let goals = matchState.goalsScored;
    let assists = matchState.assistsMade;
    let xp = matchState.xpEarned;

    if (success) {
      log.push(`${ev.minute}' ✅ ${opt.resultText}`);
      xp += opt.successXp;
      if (opt.skill === 'shooting' && Math.random() < 0.35) { home++; goals++; log.push('   🎉 ТЫ ЗАБИВАЕШЬ ГОЛ!!!'); }
      else if (opt.skill === 'passing' && Math.random() < 0.3) { home++; assists++; log.push('   🎯 ГОЛЕВАЯ ПЕРЕДАЧА!'); }
      else if (Math.random() < 0.15) { home++; goals++; log.push('   🎉 ПОСЛЕ ТВОИХ ДЕЙСТВИЙ — ГОЛ!'); }
    } else {
      log.push(`${ev.minute}' ❌ ${opt.failText}`);
      xp += Math.floor(opt.successXp * 0.3);
      if (Math.random() < 0.12) { away++; log.push('   😰 Соперник забивает после ошибки...'); }
    }

    // Random events from other players
    if (Math.random() < 0.35) {
      if (Math.random() < 0.5) { away++; log.push('   ⚽ Соперник проводит атаку — ГОЛ!'); }
      else { home++; log.push('   ⚽ Партнёр забивает!'); }
    }

    // Skill growth on success
    const newSkills = { ...player.skills };
    if (success && opt.skillGrowth > 0) {
      newSkills[opt.skill] = Math.min(99, newSkills[opt.skill] + (Math.random() < 0.5 ? opt.skillGrowth : Math.max(1, opt.skillGrowth - 1)));
    }

    const updatedPlayer = { ...player, skills: newSkills, xp: player.xp + xp };
    setPlayer(updatedPlayer);
    setMatchState({ ...matchState, homeScore: home, awayScore: away, goalsScored: goals, assistsMade: assists, xpEarned: xp, log });
    setSelectedChoice(optIdx); setChoiceResult({ success });

    // Advance to next event or finish match
    setTimeout(() => {
      setSelectedChoice(null); setChoiceResult(null);
      const nextIdx = matchState.currentEvent + 1;
      if (nextIdx >= matchState.events.length) {
        finishMatch(home, away, goals, assists, xp, newSkills);
      } else {
        setMatchState(prev => prev ? { ...prev, currentEvent: nextIdx } : null);
      }
    }, 2000);
  };

  // --- FINISH MATCH ---
  const finishMatch = (home: number, away: number, goals: number, assists: number, xp: number, skills: Skills) => {
    if (!player) return;
    const mp = matchesPlayed + 1;
    setSeasonStats((prev: { goals: number; assists: number; matches: number }) => ({ goals: prev.goals + goals, assists: prev.assists + assists, matches: prev.matches + 1 }));

    setMatchState(prev => prev ? {
      ...prev, homeScore: home, awayScore: away, goalsScored: goals, assistsMade: assists, xpEarned: xp,
      log: [...prev.log, '', `📊 ИТОГ: ${home} - ${away}`, goals > 0 ? `⚽ Голы: ${goals}` : '', assists > 0 ? `🎯 Ассисты: ${assists}` : '', `✨ Опыт: +${xp}`],
    } : null);

    const isDone = mp >= MATCHES_PER_SEASON;
    setMatchesPlayed(mp);
    // FIX: decrease training counter after every match
    setMatchesUntilTraining((prev: number) => Math.max(0, prev - 1));
    setPlayer(prev => prev ? { ...prev, skills, goals: prev.goals + goals, assists: prev.assists + assists, totalMatches: prev.totalMatches + 1 } : null);

    if (careerLevel === 0 && isDone) {
      setStoryKey('academy_invite');
      setSeasonComplete(true);
    } else if (careerLevel === 1 && isDone) {
      setStoryKey('pro_debut');
      setSeasonComplete(true);
    } else if (careerLevel >= 2 && isDone) {
      const rating = getRating(skills);
      const offers: TransferOffer[] = [];
      for (let lvl = careerLevel + 1; lvl < CAREER_PATH.length; lvl++) {
        if (rating >= CAREER_PATH[lvl].minRating) {
          offers.push({ name: CAREER_PATH[lvl].teams[Math.floor(Math.random() * CAREER_PATH[lvl].teams.length)], league: CAREER_PATH[lvl].league, level: lvl });
        }
      }
      setTransferOffers(offers);
      setSeasonComplete(true);
    } else {
      setSeasonComplete(false);
    }

    setScreen('matchEnd');
  };

  // --- TRAINING ---
  const startTraining = () => {
    setTrainingSkills({ pace: 0, shooting: 0, passing: 0, dribbling: 0, defending: 0, physical: 0 });
    setTrainingPointsLeft(3);
    setScreen('training');
  };

  const applyTraining = () => {
    if (!player || trainingPointsLeft > 0) return;
    const newSkills = { ...player.skills };
    (Object.keys(trainingSkills) as (keyof Skills)[]).forEach(k => { newSkills[k] = Math.min(99, newSkills[k] + trainingSkills[k]); });
    setPlayer({ ...player, skills: newSkills, xp: player.xp + 10, trainingCount: player.trainingCount + 1 });
    setMatchesUntilTraining(MATCHES_BETWEEN_TRAINING);
    notify('✅ Тренировка завершена! +к навыкам, +10 XP');
    setScreen('dashboard');
  };

  // --- SEASON END ---
  const finishSeason = () => {
    setSeason((s: number) => s + 1);
    setMatchesPlayed(0);
    setMatchesUntilTraining(MATCHES_BETWEEN_TRAINING);
    setSeasonComplete(false);
    setSeasonStats({ goals: 0, assists: 0, matches: 0 });
    setNewNumber(Math.floor(Math.random() * 99) + 1);
    setTransferOffers([]);
    setScreen('dashboard');
  };

  const acceptTransfer = (team: TransferOffer) => {
    const newNum = Math.floor(Math.random() * 99) + 1;
    setPlayer(prev => prev ? { ...prev, number: newNum } : null);
    setCareerLevel(team.level);
    setTransferOffers([]);
    setMatchesPlayed(0);
    setSeasonComplete(false);
    setMatchesUntilTraining(MATCHES_BETWEEN_TRAINING);
    setSeasonStats({ goals: 0, assists: 0, matches: 0 });
    setSeason((s: number) => s + 1);
    notify(`🎉 Добро пожаловать в ${team.name}! Номер: #${newNum}`);
    setScreen('dashboard');
  };

  const declineAllTransfers = () => {
    setTransferOffers([]);
    setMatchesPlayed(0);
    setSeasonComplete(false);
    setMatchesUntilTraining(MATCHES_BETWEEN_TRAINING);
    setSeasonStats({ goals: 0, assists: 0, matches: 0 });
    setNewNumber(Math.floor(Math.random() * 99) + 1);
    setSeason((s: number) => s + 1);
    notify('Остался в клубе. Докажи, что достоин большего!');
    setScreen('dashboard');
  };

  // --- SKILL UPGRADE WITH XP ---
  const upgradeSkill = (skill: keyof Skills) => {
    if (!player || player.xp < 5 || player.skills[skill] >= 99) return;
    const ns = { ...player.skills };
    ns[skill]++;
    setPlayer({ ...player, skills: ns, xp: player.xp - 5 });
    notify(`⬆️ Навык повышен! (-5 XP)`);
  };

  // ==================== RENDER: CREATE ====================
  if (screen === 'create') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-900 via-green-800 to-emerald-900 flex items-center justify-center p-4">
        <div className="bg-gray-900/80 backdrop-blur-sm rounded-2xl p-6 sm:p-8 max-w-md w-full border border-green-500/30 shadow-2xl shadow-green-500/10 animate-fadeIn">
          <div className="text-center mb-6">
            <div className="text-5xl mb-2">⚽</div>
            <h1 className="text-3xl font-bold text-white">Путь к Славе</h1>
            <p className="text-green-400 text-sm mt-1">От двора до Реала Мадрида</p>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-green-300 text-sm mb-1">Имя игрока</label>
              <input type="text" value={createForm.name} onChange={e => setCreateForm(p => ({ ...p, name: e.target.value }))}
                placeholder="Введи своё имя..." maxLength={20}
                className="w-full bg-gray-800 border border-green-500/30 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-green-400 transition" />
            </div>
            <div>
              <label className="block text-green-300 text-sm mb-2">Позиция</label>
              <div className="grid grid-cols-2 gap-2">
                {(['Нападающий', 'Полузащитник', 'Защитник', 'Вратарь'] as Position[]).map(pos => (
                  <button key={pos} onClick={() => setCreateForm(p => ({ ...p, position: pos }))}
                    className={`p-3 rounded-lg border transition text-sm font-medium ${createForm.position === pos ? 'bg-green-600 border-green-400 text-white' : 'bg-gray-800 border-gray-600 text-gray-300 hover:border-green-500/50'}`}>
                    {pos === 'Нападающий' && '⚡ '}{pos === 'Полузащитник' && '🎯 '}{pos === 'Защитник' && '🛡️ '}{pos === 'Вратарь' && '🧤 '}{pos}
                  </button>
                ))}
              </div>
            </div>
            <div className="bg-gray-800/50 rounded-lg p-3">
              <p className="text-gray-400 text-xs mb-2">Стартовые навыки:</p>
              <div className="space-y-1">
                {Object.entries(POSITION_SKILLS[createForm.position]).map(([key, val]) => (
                  <div key={key} className="flex items-center gap-2">
                    <span className="text-gray-400 text-xs w-20">{key}</span>
                    <div className="flex-1 bg-gray-700 rounded-full h-2"><div className={`h-2 rounded-full ${getBarColor(val)}`} style={{ width: `${val}%` }} /></div>
                    <span className="text-white text-xs w-6 text-right">{val}</span>
                  </div>
                ))}
              </div>
            </div>
            <button onClick={createPlayer} disabled={!createForm.name.trim()}
              className={`w-full py-3 rounded-lg font-bold text-lg transition ${createForm.name.trim() ? 'bg-green-500 hover:bg-green-400 text-green-900 shadow-lg shadow-green-500/30' : 'bg-gray-700 text-gray-500 cursor-not-allowed'}`}>
              🚀 Начать карьеру
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ==================== RENDER: STORY ====================
  if (screen === 'story') {
    const s = STORY_TEXTS[storyKey];
    if (!s) { setScreen('dashboard'); return null; }
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black flex items-center justify-center p-4">
        <div className="bg-gray-900/80 backdrop-blur-sm rounded-2xl p-6 sm:p-8 max-w-lg w-full border border-yellow-500/30 shadow-2xl animate-fadeIn">
          <h2 className="text-2xl font-bold text-white text-center mb-6">{s.title}</h2>
          <div className="space-y-3 mb-8">
            {s.lines.map((line, i) => (
              <p key={i} className="text-gray-300 text-sm leading-relaxed animate-slideUp" style={{ animationDelay: `${i * 0.3}s` }}>{line}</p>
            ))}
          </div>
          <button onClick={storyNext}
            className="w-full py-3 bg-green-500 hover:bg-green-400 text-green-900 rounded-lg font-bold text-lg transition shadow-lg shadow-green-500/30">
            Продолжить →
          </button>
        </div>
      </div>
    );
  }

  // ==================== RENDER: MATCH ====================
  if (screen === 'match' && matchState && player) {
    const ev = matchState.events[matchState.currentEvent];
    if (!ev) return null;
    const myTeam = getTeamName(careerLevel);
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-green-900/30 to-gray-900 p-3 sm:p-4">
        <div className="max-w-2xl mx-auto animate-fadeIn">
          <div className="bg-gray-900/80 backdrop-blur-sm rounded-xl p-4 mb-4 border border-green-500/20">
            <div className="flex items-center justify-between">
              <div className="text-center flex-1"><div className="text-green-400 text-xs">Ты</div><div className="text-white font-bold text-sm">#{player.number} {myTeam}</div></div>
              <div className="text-center px-4"><div className="text-3xl font-bold text-white">{matchState.homeScore} - {matchState.awayScore}</div><div className="text-yellow-400 text-sm">{ev.minute}'</div></div>
              <div className="text-center flex-1"><div className="text-red-400 text-xs">Соперник</div><div className="text-white font-bold text-sm">{matchState.rivalTeam}</div></div>
            </div>
          </div>
          <div className="bg-gray-800/80 backdrop-blur-sm rounded-xl p-5 mb-4 border border-green-500/20">
            <p className="text-white text-sm mb-4 leading-relaxed">{ev.text}</p>
            <div className="space-y-2">
              {ev.options.map((opt, i) => {
                const sel = selectedChoice === i;
                return (
                  <button key={i} onClick={() => selectedChoice === null && makeChoice(i)} disabled={selectedChoice !== null}
                    className={`w-full p-3 rounded-lg text-left transition text-sm relative ${sel ? (choiceResult?.success ? 'bg-green-600/30 border-2 border-green-400 text-green-300' : 'bg-red-600/30 border-2 border-red-400 text-red-300') : selectedChoice !== null ? 'bg-gray-700/50 border border-gray-600 text-gray-500' : 'bg-gray-700 hover:bg-gray-600 border border-gray-600 hover:border-green-500/50 text-white'}`}>
                    <div className="flex items-center justify-between">
                      <span>{opt.text}</span>
                      {sel && choiceResult && <span className="text-lg">{choiceResult.success ? '✅' : '❌'}</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="bg-gray-900/60 rounded-xl p-3 border border-gray-700/50 max-h-48 overflow-y-auto">
            <p className="text-gray-500 text-xs mb-1">Лог матча:</p>
            {matchState.log.map((line, i) => (
              <p key={i} className={`text-xs leading-relaxed mb-0.5 ${line.includes('✅') ? 'text-green-400' : line.includes('❌') ? 'text-red-400' : line.includes('🎉') ? 'text-yellow-400 font-bold' : line.includes('🎯') ? 'text-cyan-400' : line.includes('😰') ? 'text-orange-400' : 'text-gray-400'}`}>{line}</p>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ==================== RENDER: MATCH END ====================
  if (screen === 'matchEnd' && matchState) {
    const res = matchState.homeScore > matchState.awayScore ? 'ПОБЕДА! 🏆' : matchState.homeScore < matchState.awayScore ? 'ПОРАЖЕНИЕ 😢' : 'НИЧЬЯ 🤝';
    const rc = matchState.homeScore > matchState.awayScore ? 'text-green-400' : matchState.homeScore < matchState.awayScore ? 'text-red-400' : 'text-yellow-400';
    const hasNext = seasonComplete || storyKey;

    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black flex items-center justify-center p-4">
        <div className="bg-gray-900/80 backdrop-blur-sm rounded-2xl p-6 sm:p-8 max-w-md w-full border border-green-500/20 shadow-2xl animate-fadeIn">
          <h2 className={`text-2xl font-bold text-center mb-4 ${rc}`}>{res}</h2>
          <div className="text-center mb-6">
            <div className="text-5xl font-bold text-white mb-2">{matchState.homeScore} : {matchState.awayScore}</div>
            <div className="text-gray-400 text-sm">{getTeamName(careerLevel)} vs {matchState.rivalTeam}</div>
          </div>
          <div className="grid grid-cols-3 gap-3 mb-6">
            <div className="bg-gray-800 rounded-lg p-3 text-center"><div className="text-2xl font-bold text-white">{matchState.goalsScored}</div><div className="text-gray-400 text-xs">Голы</div></div>
            <div className="bg-gray-800 rounded-lg p-3 text-center"><div className="text-2xl font-bold text-white">{matchState.assistsMade}</div><div className="text-gray-400 text-xs">Ассисты</div></div>
            <div className="bg-gray-800 rounded-lg p-3 text-center"><div className="text-2xl font-bold text-yellow-400">+{matchState.xpEarned}</div><div className="text-gray-400 text-xs">Опыт</div></div>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-3 mb-6 max-h-36 overflow-y-auto">
            {matchState.log.map((line, i) => (
              <p key={i} className={`text-xs leading-relaxed mb-0.5 ${line.includes('✅') ? 'text-green-400' : line.includes('❌') ? 'text-red-400' : line.includes('🎉') ? 'text-yellow-400' : line.includes('🎯') ? 'text-cyan-400' : line.includes('😰') ? 'text-orange-400' : 'text-gray-400'}`}>{line}</p>
            ))}
          </div>
          <button onClick={() => {
            if (storyKey) { setScreen('story'); }
            else if (seasonComplete) { setScreen('seasonEnd'); }
            else { setScreen('dashboard'); }
          }} className="w-full py-3 bg-green-500 hover:bg-green-400 text-green-900 rounded-lg font-bold transition shadow-lg shadow-green-500/30">
            {hasNext ? 'Продолжить →' : 'На главную'}
          </button>
        </div>
      </div>
    );
  }

  // ==================== RENDER: TRAINING ====================
  if (screen === 'training' && player) {
    const skillLabels: Record<keyof Skills, string> = {
      pace: '⚡ Скорость', shooting: '🎯 Удар', passing: '🎪 Пас',
      dribbling: '💨 Дриблинг', defending: '🛡️ Защита', physical: '💪 Физика'
    };
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900/30 to-gray-900 flex items-center justify-center p-4">
        <div className="bg-gray-900/80 backdrop-blur-sm rounded-2xl p-6 sm:p-8 max-w-md w-full border border-blue-500/30 shadow-2xl animate-fadeIn">
          <h2 className="text-2xl font-bold text-white text-center mb-2">🏋️ Тренировка</h2>
          <p className="text-blue-400 text-center text-sm mb-6">Распредели 3 очка между навыками</p>
          <div className="space-y-3 mb-6">
            {(Object.keys(skillLabels) as (keyof Skills)[]).map(skill => (
              <div key={skill} className="bg-gray-800 rounded-lg p-3 flex items-center justify-between">
                <div className="flex-1">
                  <div className="text-white text-sm">{skillLabels[skill]}</div>
                  <div className="text-gray-400 text-xs">{player.skills[skill]} → {player.skills[skill] + trainingSkills[skill]}</div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => { if (trainingSkills[skill] > 0) { setTrainingSkills(p => ({ ...p, [skill]: p[skill] - 1 })); setTrainingPointsLeft(p => p + 1); } }}
                    disabled={trainingSkills[skill] <= 0} className="w-8 h-8 rounded-full bg-gray-700 hover:bg-gray-600 text-white font-bold disabled:opacity-30 transition">−</button>
                  <span className={`text-lg font-bold w-8 text-center ${trainingSkills[skill] > 0 ? 'text-blue-400' : 'text-gray-600'}`}>{trainingSkills[skill]}</span>
                  <button onClick={() => { if (trainingPointsLeft > 0 && trainingSkills[skill] < 3) { setTrainingSkills(p => ({ ...p, [skill]: p[skill] + 1 })); setTrainingPointsLeft(p => p - 1); } }}
                    disabled={trainingPointsLeft <= 0 || trainingSkills[skill] >= 3} className="w-8 h-8 rounded-full bg-green-600 hover:bg-green-500 text-white font-bold disabled:opacity-30 transition">+</button>
                </div>
              </div>
            ))}
          </div>
          <div className="text-center mb-4"><span className={`text-lg font-bold ${trainingPointsLeft > 0 ? 'text-yellow-400' : 'text-green-400'}`}>Осталось очков: {trainingPointsLeft}</span></div>
          <button onClick={applyTraining} disabled={trainingPointsLeft > 0}
            className={`w-full py-3 rounded-lg font-bold transition ${trainingPointsLeft > 0 ? 'bg-gray-700 text-gray-500 cursor-not-allowed' : 'bg-blue-500 hover:bg-blue-400 text-white shadow-lg shadow-blue-500/30'}`}>
            Завершить тренировку ✅
          </button>
        </div>
      </div>
    );
  }

  // ==================== RENDER: SEASON END ====================
  if (screen === 'seasonEnd' && player) {
    const rating = getRating(player.skills);
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-yellow-900/20 to-gray-900 flex items-center justify-center p-4">
        <div className="bg-gray-900/80 backdrop-blur-sm rounded-2xl p-6 sm:p-8 max-w-md w-full border border-yellow-500/30 shadow-2xl animate-fadeIn">
          <h2 className="text-2xl font-bold text-white text-center mb-1">📅 Конец Сезона {season}</h2>
          <p className="text-gray-400 text-center text-sm mb-6">{getTeamName(careerLevel)} • {CAREER_PATH[careerLevel]?.league}</p>
          <div className="grid grid-cols-3 gap-3 mb-6">
            <div className="bg-gray-800 rounded-lg p-3 text-center"><div className="text-xl font-bold text-white">{seasonStats.matches}</div><div className="text-gray-400 text-xs">Матчи</div></div>
            <div className="bg-gray-800 rounded-lg p-3 text-center"><div className="text-xl font-bold text-white">{seasonStats.goals}</div><div className="text-gray-400 text-xs">Голы</div></div>
            <div className="bg-gray-800 rounded-lg p-3 text-center"><div className="text-xl font-bold text-white">{seasonStats.assists}</div><div className="text-gray-400 text-xs">Ассисты</div></div>
          </div>
          <div className="bg-gray-800 rounded-lg p-4 mb-6 text-center">
            <div className={`text-4xl font-bold ${getRatingColor(rating)}`}>{rating}</div>
            <div className="text-gray-400 text-sm">Общий рейтинг</div>
          </div>

          {newNumber !== null && (
            <div className="bg-gray-800 rounded-lg p-4 mb-6">
              <p className="text-white text-sm mb-3">🔢 Новый номер на сезон {season + 1}: <span className="text-yellow-400 font-bold">#{newNumber}</span></p>
              <div className="flex gap-2 justify-center">
                <button onClick={() => setNewNumber(null)} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm transition">Оставить #{player.number}</button>
                <button onClick={() => { if (player) { setPlayer({ ...player, number: newNumber }); } setNewNumber(null); notify(`🔢 Новый номер: #${newNumber}`); }}
                  className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg text-sm transition">Взять #{newNumber}</button>
              </div>
            </div>
          )}

          {transferOffers.length > 0 && (
            <div className="mb-6">
              <h3 className="text-lg font-bold text-yellow-400 mb-3 text-center">📬 Трансферные предложения!</h3>
              <div className="space-y-2">
                {transferOffers.map((team, i) => (
                  <div key={i} className="bg-gray-800 rounded-lg p-4 border border-yellow-500/30">
                    <div className="flex items-center justify-between mb-3">
                      <div><div className="text-white font-bold">{team.name}</div><div className="text-gray-400 text-xs">{team.league}</div></div>
                      <span className="text-yellow-400 text-xs bg-yellow-400/10 px-2 py-1 rounded">{CAREER_PATH[team.level]?.name}</span>
                    </div>
                    <button onClick={() => acceptTransfer(team)} className="w-full py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg text-sm font-bold transition">✅ Принять предложение</button>
                  </div>
                ))}
              </div>
              <button onClick={declineAllTransfers} className="w-full mt-2 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm transition">❌ Остаться в клубе</button>
            </div>
          )}

          {transferOffers.length === 0 && careerLevel >= 2 && (
            <div className="bg-gray-800 rounded-lg p-4 mb-6 text-center">
              <p className="text-gray-400 text-sm mb-2">Трансферных предложений нет. Играй лучше!</p>
              {careerLevel < 3 && <p className="text-red-400 text-xs">Нужен рейтинг 50+ для 2-го дивизиона</p>}
              {careerLevel >= 3 && careerLevel < 4 && rating < 65 && <p className="text-yellow-400 text-xs">Нужен рейтинг 65+ для 1-го дивизиона</p>}
              {careerLevel >= 4 && careerLevel < 5 && rating < 80 && <p className="text-yellow-400 text-xs">Нужен рейтинг 80+ для элитных клубов</p>}
            </div>
          )}

          <button onClick={finishSeason} className="w-full py-3 bg-green-500 hover:bg-green-400 text-green-900 rounded-lg font-bold transition shadow-lg shadow-green-500/30">
            Начать сезон {season + 1} ⚽
          </button>
        </div>
      </div>
    );
  }

  // ==================== RENDER: DASHBOARD ====================
  if (screen === 'dashboard' && player) {
    const rating = getRating(player.skills);
    const canTrain = matchesUntilTraining <= 0;
    const careerStage = CAREER_PATH[careerLevel];
    const myTeam = getTeamName(careerLevel);
    const skillLabels: Record<keyof Skills, string> = {
      pace: '⚡ Скорость', shooting: '🎯 Удар', passing: '🎪 Пас',
      dribbling: '💨 Дриблинг', defending: '🛡️ Защита', physical: '💪 Физика'
    };

    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-green-900/20 to-gray-900 p-3 sm:p-4 pb-20">
        <div className="max-w-2xl mx-auto">
          {/* Header */}
          <div className="bg-gray-900/80 backdrop-blur-sm rounded-xl p-4 mb-4 border border-green-500/20">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-xl font-bold text-white">{player.name}</h1>
                <p className="text-green-400 text-xs">Сезон {season} | {myTeam} • {careerStage?.league}</p>
              </div>
              <div className="text-right"><div className={`text-2xl font-bold ${getRatingColor(rating)}`}>{rating}</div><div className="text-gray-400 text-xs">Рейтинг</div></div>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-4 gap-2 mb-4">
            <div className="bg-gray-800 rounded-lg p-2 text-center"><div className="text-white font-bold text-sm">#{player.number}</div><div className="text-gray-500 text-xs">Номер</div></div>
            <div className="bg-gray-800 rounded-lg p-2 text-center"><div className="text-white font-bold text-sm">{player.position}</div><div className="text-gray-500 text-xs">Позиция</div></div>
            <div className="bg-gray-800 rounded-lg p-2 text-center"><div className="text-yellow-400 font-bold text-sm">{player.xp}</div><div className="text-gray-500 text-xs">Опыт</div></div>
            <div className="bg-gray-800 rounded-lg p-2 text-center"><div className="text-white font-bold text-sm">{player.totalMatches}</div><div className="text-gray-500 text-xs">Матчи</div></div>
          </div>

          {/* Career Path */}
          <div className="bg-gray-800 rounded-lg p-4 mb-4">
            <h3 className="text-white font-bold text-sm mb-3">🏆 Карьерный путь</h3>
            <div className="space-y-1">
              {CAREER_PATH.map((stage, i) => {
                const isCurrent = i === careerLevel;
                const isPast = i < careerLevel;
                const canReach = rating >= stage.minRating;
                return (
                  <div key={i} className={`flex items-center gap-3 p-2 rounded-lg transition ${isCurrent ? 'bg-green-600/20 border border-green-500/40' : isPast ? 'bg-green-900/20' : ''}`}>
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${isCurrent ? 'bg-green-500 text-green-900' : isPast ? 'bg-green-700 text-green-300' : 'bg-gray-700 text-gray-500'}`}>
                      {isPast ? '✓' : i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className={`text-xs font-medium truncate ${isCurrent ? 'text-green-400' : isPast ? 'text-green-600' : 'text-gray-500'}`}>{stage.name}{stage.level >= 3 ? ` (${stage.league})` : ''}</div>
                      {i > careerLevel && stage.minRating > 0 && (
                        <div className={`text-xs ${canReach ? 'text-yellow-500' : 'text-gray-600'}`}>Рейтинг {stage.minRating}+ {canReach ? '✅' : '🔒'}</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Skills */}
          <div className="bg-gray-800 rounded-lg p-4 mb-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-white font-bold text-sm">📊 Навыки</h3>
              {player.xp >= 5 && <span className="text-yellow-400 text-xs">+1 за 5 XP</span>}
            </div>
            <div className="space-y-2">
              {(Object.keys(player.skills) as (keyof Skills)[]).map(skill => (
                <div key={skill} className="flex items-center gap-2">
                  <span className="text-gray-400 text-xs w-24 shrink-0">{skillLabels[skill]}</span>
                  <div className="flex-1 bg-gray-700 rounded-full h-3"><div className={`h-3 rounded-full transition-all ${getBarColor(player.skills[skill])}`} style={{ width: `${player.skills[skill]}%` }} /></div>
                  <span className="text-white text-xs w-8 text-right font-bold">{player.skills[skill]}</span>
                  {player.xp >= 5 && player.skills[skill] < 99 && (
                    <button onClick={() => upgradeSkill(skill)} className="text-yellow-400 text-xs hover:text-yellow-300 px-1 transition shrink-0" title="Прокачать за 5 XP">⬆️</button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Season Progress */}
          <div className="bg-gray-800 rounded-lg p-4 mb-4">
            <h3 className="text-white font-bold text-sm mb-2">📅 Сезон {season}</h3>
            <div className="flex items-center justify-between text-xs text-gray-400 mb-2">
              <span>Матчей: {matchesPlayed} / {MATCHES_PER_SEASON}</span>
              <span>Голы: {seasonStats.goals} | Ассисты: {seasonStats.assists}</span>
            </div>
            <div className="bg-gray-700 rounded-full h-2"><div className="bg-green-500 h-2 rounded-full transition-all" style={{ width: `${(matchesPlayed / MATCHES_PER_SEASON) * 100}%` }} /></div>
            {canTrain && matchesPlayed < MATCHES_PER_SEASON && <p className="text-blue-400 text-xs mt-2">🏋️ Тренировка доступна!</p>}
            {!canTrain && matchesPlayed < MATCHES_PER_SEASON && <p className="text-gray-500 text-xs mt-2">До тренировки: {matchesUntilTraining} матчей</p>}
          </div>

          {/* Career Stats */}
          <div className="bg-gray-800/50 rounded-lg p-4 mb-4">
            <h3 className="text-white font-bold text-sm mb-2">📈 Карьерная статистика</h3>
            <div className="grid grid-cols-4 gap-3 text-center">
              <div><div className="text-white font-bold">{player.totalMatches}</div><div className="text-gray-500 text-xs">Всего матчей</div></div>
              <div><div className="text-white font-bold">{player.goals}</div><div className="text-gray-500 text-xs">Всего голов</div></div>
              <div><div className="text-white font-bold">{player.assists}</div><div className="text-gray-500 text-xs">Всего ассистов</div></div>
              <div><div className="text-white font-bold">{player.trainingCount}</div><div className="text-gray-500 text-xs">Тренировок</div></div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="space-y-2">
            {matchesPlayed < MATCHES_PER_SEASON && (
              <button onClick={startMatch} className="w-full py-4 bg-green-500 hover:bg-green-400 text-green-900 rounded-xl font-bold text-lg transition shadow-lg shadow-green-500/30">
                ⚽ Играть матч ({matchesPlayed}/{MATCHES_PER_SEASON})
              </button>
            )}
            {canTrain && matchesPlayed < MATCHES_PER_SEASON && (
              <button onClick={startTraining} className="w-full py-3 bg-blue-500 hover:bg-blue-400 text-white rounded-xl font-bold transition shadow-lg shadow-blue-500/30">
                🏋️ Тренировка
              </button>
            )}
            {matchesPlayed >= MATCHES_PER_SEASON && (
              <button onClick={() => setScreen('seasonEnd')}
                className="w-full py-4 bg-yellow-500 hover:bg-yellow-400 text-yellow-900 rounded-xl font-bold text-lg transition shadow-lg shadow-yellow-500/30">
                📅 Завершить сезон
              </button>
            )}
          </div>
        </div>

        {notification && (
          <div className="fixed top-4 left-1/2 -translate-x-1/2 bg-green-600 text-white px-6 py-3 rounded-lg shadow-lg z-50 animate-slideUp text-sm font-medium">
            {notification}
          </div>
        )}
      </div>
    );
  }

  return null;
}

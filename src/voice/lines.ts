// Everything Coach Rex says. Each line is recorded ahead of time into an
// audio clip (see scripts/voice/generate.py), so the game never synthesises
// speech while it runs. Lines that say Zef's name (or call him "big guy")
// have a name-free twin for any other child, and the line that says how many
// nights fill the meter is recorded for each goal a grown-up can pick on the
// new-child screen (3, 5, 10, 15 or 20 nights), with a twin without the
// number for any other goal.

export interface Line {
  text: string;
  /** used instead when the child's name isn't Zef */
  nameless?: string;
  /** used instead when the goal is none of the ones said out loud */
  anyGoal?: string;
  /** versions that say another goal out loud, by number of nights */
  goals?: Record<number, string>;
}

/** The goal `text` says out loud. */
export const SPOKEN_GOAL = 20;

/** Goals Coach Rex can say out loud (the ones offered on the new-child screen). */
export const SPOKEN_GOALS = [3, 5, 10, 15, 20];

const meterLine = (nights: string) =>
  `Now, see this meter? Every dry night in a row fills it up. Stay dry ${nights} nights in a row, and it's all the way full! That means you're ready to wear underwear at night!`;

/** The same for the kinder meter, where a not-dry night only takes one dot away. */
const kindMeterLine = (dots: string) =>
  `Now, see this meter? Every dry night adds a dot, and a not-dry night only takes one away. Get ${dots} dots, and it's all the way full! That means you're ready to wear underwear at night!`;

const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen'];

/** The most stars there can be between two treasure chests. */
export const MAX_CHEST_GAP = 15;

/** "Four more stars to the next treasure chest!", for 1 to 15 stars. */
function chestMoreLines(): Record<string, Line> {
  const out: Record<string, Line> = { 'chest-more-1': { text: 'Just one more star to the next treasure chest!' } };
  for (let n = 2; n <= MAX_CHEST_GAP; n++) {
    const w = NUMBER_WORDS[n];
    out[`chest-more-${n}`] = { text: `${w[0].toUpperCase()}${w.slice(1)} more stars to the next treasure chest!` };
  }
  return out;
}

export const LINES: Record<string, Line> = {
  // ---------------------------------------------------------- first time
  'intro-1': {
    text: "Hey, big guy! I'm Coach Rex! I heard you're on a super important mission!",
    nameless: "Hey, superstar! I'm Coach Rex! I heard you're on a super important mission!",
  },
  'intro-2': { text: "You're learning to stay dry at night, so you can wear underwear to bed instead of diapers! That's a big deal! And you know what? I know you can do it!" },
  'intro-3': { text: "Here's how it works. Every morning, you press a button. Dry night? You get a big shiny star, and we hop ahead on our adventure!" },
  'intro-4': { text: "Not dry? That's okay! You get a big dino hug, and we'll try again!" },
  'intro-prizes': { text: "And along the way, you'll win fun prizes for staying dry! Get enough stars, and you get to open a treasure chest!" },
  'intro-meter': {
    text: meterLine('twenty'),
    goals: { 3: meterLine('three'), 5: meterLine('five'), 10: meterLine('ten'), 15: meterLine('fifteen') },
    anyGoal: "Now, see this meter? Every dry night in a row fills it up. When it's all the way full, that means you're ready to wear underwear at night!",
  },
  'intro-meter-kind': {
    text: kindMeterLine('twenty'),
    goals: { 3: kindMeterLine('three'), 5: kindMeterLine('five'), 10: kindMeterLine('ten'), 15: kindMeterLine('fifteen') },
    anyGoal: "Now, see this meter? Every dry night adds a dot, and a not-dry night only takes one away. When it's all the way full, that means you're ready to wear underwear at night!",
  },
  'intro-store': { text: 'And then? We fly to the Underwear Store, way up on that mountain! You get to pick out underwear for your dino, so you can both wear underwear at night!' },
  'intro-go': { text: "Ready? Let's do this!" },
  // the tap-along parts of the intro
  'intro-tap-star': { text: "Let's try it! Tap the star!" },
  'intro-yes': { text: 'Yes! Just like that!' },
  'intro-tap-chest': { text: 'Go ahead, tap the treasure chest!' },
  'intro-chest-tease': { text: "Ooh, it's locked! You'll open it when you get there!" },
  'intro-tap-meter': { text: 'Tap the meter and see what full looks like!' },
  'intro-meter-full': { text: "Whoa! That's what a full meter looks like!" },
  'intro-roar': { text: 'Tap your dino and give me your biggest roar!' },
  'pick-dino': { text: 'First, pick your dino! Which one is you?' },
  'picked-trex': { text: 'A T. rex! Rawr! Great choice!' },
  'picked-trike': { text: 'A triceratops! Three horns, triple awesome!' },
  'picked-stego': { text: 'A stegosaurus! Look at those cool spikes!' },
  'picked-longneck': { text: 'A long-neck! You can see everything from up there!' },
  'pick-color': { text: 'Now pick your color!' },
  'color-done': { text: "Looking good! Let's go!" },

  // ---------------------------------------------------------- mornings
  'greet-1': { text: 'Good morning, Zef!', nameless: 'Good morning, superstar!' },
  'greet-2': { text: 'Rise and shine, Zef!', nameless: 'Rise and shine, buddy!' },
  'greet-3': { text: 'Good morning, big guy!', nameless: 'Good morning, sunshine!' },
  'greet-4': { text: 'Rise and roar! Good morning!' },
  'greet-5': { text: "Good morning! I've been waiting for you!" },
  'greet-6': { text: "Hey, hey, look who's up! Good morning!" },
  'greet-7': { text: 'Stomp, stomp! Good morning, superstar!' },
  'greet-8': { text: 'Good morning, my favorite dino buddy!' },
  'greet-9': { text: 'Yawn! Oh, hey! Good morning, sleepyhead!' },
  ask: { text: 'Did you stay dry last night? Press the sun if you did, or the heart for a big hug!' },
  'ask-short': { text: 'Did you stay dry last night?' },
  already: { text: 'Hey, Zef! You already pressed the button today. See you tomorrow morning!', nameless: 'Hey, buddy! You already pressed the button today. See you tomorrow morning!' },

  // ---------------------------------------------------------- dry
  'dry-1': { text: 'Yes! You stayed dry! Woo-hoo!' },
  'dry-2': { text: "Dry night! That's what I'm talking about!" },
  'dry-3': { text: 'Whoa, you did it! Way to go, big guy!', nameless: 'Whoa, you did it! Way to go, superstar!' },
  'dry-4': { text: "Dry again! You're a superstar!" },
  'dry-5': { text: 'Boom! Another dry night! Yeah, buddy!' },
  'dry-6': { text: "Yeah! You're doing amazing, Zef!", nameless: "Yeah! You're doing amazing, buddy!" },
  'dry-7': { text: "Woo-hoo! Another dry night! You're on a roll!" },
  'dry-8': { text: 'Look at you go! Dry again!' },
  'dry-9': { text: 'Wow, wow, wow! You stayed dry!' },
  'dry-10': { text: "Yes, yes, yes! That's my dino buddy!" },
  'dry-11': { text: "Dry night! You're doing it! Way to go!" },
  'dry-12': { text: 'Ding, ding, ding! Dry night champion!' },
  'first-star': { text: 'Your very first star! This is the start of something awesome!' },
  // every tenth star gets its own cheer
  'stars-10': { text: "Ten stars! Ten whole stars! You're amazing!" },
  'stars-20': { text: "Twenty stars! That's so many stars!" },
  'stars-30': { text: "Thirty stars! You're a dry night superstar!" },
  'stars-40': { text: 'Forty stars! Can you believe it? Forty!' },
  'stars-50': { text: "Fifty stars! That's halfway to one hundred!" },
  'stars-60': { text: "Sixty stars! You're unstoppable!" },
  'stars-70': { text: "Seventy stars! That's incredible!" },
  'stars-80': { text: "Eighty stars! You're a dry night legend!" },
  'stars-90': { text: 'Ninety stars! Almost one hundred!' },
  'stars-100': { text: 'One hundred stars! One hundred! This is the best day ever!' },
  hop: { text: 'Hop, hop, hop!' },

  // ---------------------------------------------------------- surprises
  egg: { text: 'Ooh, look! A mystery egg! Tap it to crack it open!' },
  'egg-tap': { text: 'Keep tapping!' },
  'egg-done': { text: 'Whoa! Look what was inside! Tap the big button to collect it!' },
  'acc-cap': { text: 'A baseball cap! Looking sharp!' },
  'acc-shades': { text: 'Sunglasses! Too cool!' },
  'acc-soccer': { text: 'A soccer ball! Goal!' },
  'acc-jersey': { text: 'A basketball jersey! Slam dunk!' },
  'acc-party': { text: "A party hat! Let's party!" },
  'acc-bowtie': { text: 'A bow tie! So fancy!' },
  'acc-cowboy': { text: 'A cowboy hat! Yee-haw!' },
  'acc-cape': { text: 'A superhero cape! Super dino!' },
  'acc-crown': { text: "A crown! You're the king of the dinos!", nameless: "A crown! You're dino royalty!" },
  'acc-basketball': { text: 'A basketball! Swish!' },
  'acc-propeller': { text: 'A propeller hat! Up, up and away!' },
  'acc-medal': { text: 'A gold medal! Number one!' },
  'acc-sneakers': { text: 'Sneakers! Super speedy feet!' },
  'acc-sweatband': { text: 'A sweatband! Ready for the big game!' },
  'acc-football': { text: 'A football! Touchdown!' },
  'acc-pirate': { text: 'A pirate hat! Arr, matey!' },
  'acc-scarf': { text: 'A cozy scarf! Nice and warm!' },
  'acc-tutu': { text: 'A tutu! Twirl, twirl, twirl!' },
  'acc-chef': { text: "A chef hat! What's cooking?" },
  'acc-viking': { text: 'A viking helmet! So brave!' },
  'acc-trophy': { text: "A trophy! You're a champion!" },
  'acc-wizard': { text: 'A wizard hat! Abracadabra!' },
  'acc-boots': { text: 'Rain boots! Splish, splash!' },
  'acc-goggles': { text: 'Swim goggles! Ready to splash!' },
  highfive: { text: 'Up top! Give me a high five!' },
  'highfive-done': { text: 'Ooh, that was a good one!' },
  dance: { text: 'Dance party! Show me your silliest dino dance!' },
  'dance-done': { text: 'Ha! Those are some sweet moves!' },
  roar: { text: "Let's hear your biggest dino roar! Tap your dino to roar!" },
  'roar-more': { text: 'Louder!' },
  'roar-done': { text: 'Whoa! That was the biggest roar ever!' },
  balloons: { text: 'Whoa, balloons! Can you pop them all?' },
  'balloons-more': { text: 'Keep popping!' },
  'balloons-done': { text: 'Pop, pop, pop! You got them all!' },
  fireworks: { text: "It's fireworks time! Tap the sky to make fireworks!" },
  'fireworks-done': { text: 'Ooh! Aah! So pretty!' },
  peekaboo: { text: "Let's play hide and seek! I'll hide, and you find me. Ready? Close your eyes!" },
  'peekaboo-find': { text: 'Okay! Where am I? Can you find me?' },
  'peekaboo-nope': { text: 'Nope, not there!' },
  'peekaboo-found': { text: 'Peekaboo! You found me!' },
  tickle: { text: "Ooh, I bet you can't tickle me! Go ahead, try it!" },
  'tickle-lots': { text: "Ha ha ha! Stop, stop! I can't stop laughing!" },
  'tickle-done': { text: "Okay, okay, you win! You're the tickle champion!" },
  snack: { text: 'My tummy is rumbling! Can you feed me some fruit? Tap the fruit!' },
  'snack-yum': { text: 'Yum, yum, yummy!' },
  'snack-more': { text: 'More, please!' },
  'snack-done': { text: 'Oops! Excuse me! That was delicious! Thank you!' },
  moves: { text: 'Time to move! Stand up and do what I do!' },
  'move-stomp': { text: 'Stomp your feet like a T. rex! Stomp, stomp, stomp!' },
  'move-stretch': { text: 'Reach up high like a long-neck! Stretch, stretch, stretch!' },
  'move-wiggle': { text: 'Wiggle your tail like a stegosaurus! Wiggle, wiggle, wiggle!' },
  'move-spin': { text: 'Spin around like a dino tornado! Whee!' },
  'move-hop': { text: 'Jump like a baby dino! Jump, jump, jump!' },
  'moves-done': { text: 'Great moves! Now your body is wide awake!' },
  band: { text: "Let's make music! Tap the rocks to play a song!" },
  'band-more': { text: 'Ooh, I love it! Keep playing!' },
  'band-done': { text: "What a song! You're a dino rock star!" },
  wardrobe: { text: 'Dress-up time! Tap something to put it on!' },
  'wardrobe-hint': { text: 'Psst! Tap the hanger button to dress up your dino!' },
  'wardrobe-more': { text: 'More fun stuff is hiding in mystery eggs! Stay dry to find it all!' },

  // ---------------------------------------------------------- meter
  'meter-up': { text: 'Look! Your meter is filling up!' },
  'meter-half': { text: 'Your meter is halfway full! Underwear at night, here we come!' },
  'meter-3': { text: "Only three more dry nights, and you're ready for underwear at night!" },
  'meter-2': { text: 'Just two more dry nights to go!' },
  'meter-1': { text: 'Just one more dry night! You can do it!' },
  'meter-final': { text: 'Whoa! You made it to the last five dots! Stay dry five nights in a row, and your meter is all the way full!' },
  // a morning nobody recorded: the dots that need nights in a row start over
  'meter-missed': { text: 'Oh! We missed a morning, so the last five dots start over. But you stayed dry last night, so here comes the first one!' },
  'meter-missed-all': { text: 'Oh! We missed a morning, so your meter starts over. But you stayed dry last night!' },

  // ---------------------------------------------------------- chests
  'chest-reach': { text: "You made it to the treasure chest! Tap it and see what's inside!" },
  // tap the stars at the top: how far to the next chest
  ...chestMoreLines(),
  'prize-candy': { text: 'You earned... candy! Go tell your grown-up!' },
  'prize-movie': { text: 'You earned... movie night! Go tell your grown-up!' },
  'prize-mcdonalds': { text: "You earned... McDonald's! Go tell your grown-up!" },
  'prize-squishy': { text: 'You earned... a squishy! Go tell your grown-up!' },
  'prize-pizza': { text: 'You earned... a pizza party! Go tell your grown-up!' },
  'prize-icecream': { text: 'You earned... ice cream! Go tell your grown-up!' },
  'prize-toy': { text: 'You earned... a new toy! Go tell your grown-up!' },
  'prize-park': { text: 'You earned... a trip to the park! Go tell your grown-up!' },
  'prize-book': { text: 'You earned... a new book! Go tell your grown-up!' },
  'prize-gift': { text: 'You earned a prize! Go tell your grown-up!' },
  'land-0': { text: 'Next stop: Jungle Jumble!' },
  'land-1': { text: 'Next stop: Volcano Valley!' },
  'land-2': { text: 'Next stop: Splashy Lagoon!' },
  'land-3': { text: 'Next stop: Fossil Canyon!' },
  'land-4': { text: 'Next stop: Snowball Mountain!' },
  'land-5': { text: 'Next stop: Crystal Caves!' },
  'land-6': { text: 'Next stop: Rainbow Meadow!' },

  // ---------------------------------------------------------- the store
  'store-open': {
    text: "Wow, Zef! You did it! Your meter is all the way full! That means you're ready to wear underwear at night! And the Underwear Store is open!",
    nameless: "Wow! You did it! Your meter is all the way full! That means you're ready to wear underwear at night! And the Underwear Store is open!",
  },
  'store-fly': { text: "Hop on! Let's fly!" },
  'store-pick': { text: 'Welcome to the Underwear Store! Pick out some underwear for your dino!' },
  'store-picked': { text: 'Ooh! Those are awesome!' },
  'store-done': { text: "Now you and your dino can both wear underwear at night! Go show your grown-up! I'm so proud of you!" },

  // ---------------------------------------------------------- not dry
  'wet-1': { text: "Hey, that's okay, big guy. Your body's still practicing.", nameless: "Hey, that's okay, buddy. Your body's still practicing." },
  'wet-2': { text: 'Come here! Big dino hug! My arms are tiny, but my hugs are huge!' },
  'wet-3': { text: "And look! You still have all your stars! Tonight's a brand new try!" },
  'wet-3-kind': { text: "And look! You still have all your stars, and your meter only lost one dot! Tonight's a brand new try!" },
  'wet-3-final': { text: "And look! You still have all your stars, and your meter is still way up high! The last five dots just start over. Tonight's a brand new try!" },
  'wet-4': { text: "No worries, buddy. Every dino has nights like that. You're still my favorite dino!" },
  'wet-5': { text: "Oops! That's okay. Bodies need lots of practice, and you're doing great!" },

  // ---------------------------------------------------------- a joke or a dino fact, every other day
  'joke-time-1': { text: 'Hey! Want to hear a joke?' },
  'joke-time-2': { text: "Ooh, I've got a funny one for you!" },
  'joke-1-q': { text: "What do you call a dinosaur that's sleeping?" },
  'joke-1-a': { text: 'A dino-snore!' },
  'joke-2-q': { text: 'What does a triceratops sit on?' },
  'joke-2-a': { text: 'Its tricera-bottom!' },
  'joke-3-q': { text: 'What happens when a dinosaur sneezes?' },
  'joke-3-a': { text: 'Everybody gets out of the way!' },
  'joke-4-q': { text: 'Why did the dinosaur cross the road?' },
  'joke-4-a': { text: 'Because there were no chickens yet!' },
  'joke-5-q': { text: 'What do you call a dinosaur that never gives up?' },
  'joke-5-a': { text: 'A try-try-try-ceratops!' },
  'joke-6-q': { text: "How can you tell there's a dinosaur in your fridge?" },
  'joke-6-a': { text: "The door won't close!" },
  'joke-7-q': { text: "What's louder than a dinosaur roar?" },
  'joke-7-a': { text: 'Two dinosaurs roaring!' },
  'joke-8-q': { text: 'What do you call a dinosaur in a cowboy hat?' },
  'joke-8-a': { text: 'Tyrannosaurus Tex!' },
  'joke-9-q': { text: "Why can't a T. rex clap?" },
  'joke-9-a': { text: 'Its arms are too tiny! Just like mine!' },
  'joke-10-q': { text: 'Why are dinosaurs bad at hide and seek?' },
  'joke-10-a': { text: "Because they're way too big to hide!" },
  'joke-11-q': { text: "What's big and green and has three wheels?" },
  'joke-11-a': { text: 'A dinosaur on a tricycle!' },
  'joke-12-q': { text: 'Why did the dinosaur paint its toenails red?' },
  'joke-12-a': { text: 'So it could hide in the strawberry patch!' },
  'fact-time-1': { text: "Here's a cool dino fact!" },
  'fact-time-2': { text: 'Did you know?' },
  'fact-1': { text: 'Triceratops had three horns on its face. Its name even means three-horned face!' },
  'fact-2': { text: 'A T. rex tooth could be as big as a banana!' },
  'fact-3': { text: 'Stegosaurus had big plates on its back and sharp spikes on its tail!' },
  'fact-4': { text: 'Some long-neck dinosaurs were as tall as a building! They could peek into a window way up high!' },
  'fact-5': { text: 'Some dinosaurs had feathers, just like birds!' },
  'fact-6': { text: "Birds are dinosaurs too! The birds outside are T. rex's tiny cousins!" },
  'fact-7': { text: "The word dinosaur means terrible lizard! But I'm a friendly one!" },
  'fact-8': { text: 'The biggest dinosaurs were as long as three school buses!' },
  'fact-9': { text: 'Velociraptor was only about as big as a turkey!' },
  'fact-10': { text: 'Ankylosaurus had a big club on the end of its tail, like a hammer!' },
  'fact-11': { text: "Pterodactyls could fly, but they weren't dinosaurs! They were flying reptiles!" },
  'fact-12': { text: 'Dinosaur bones that turned to stone are called fossils! People who dig them up are called paleontologists!' },

  // ---------------------------------------------------------- goodbye
  'bye-1': { text: 'See you tomorrow morning, big guy!', nameless: 'See you tomorrow morning, superstar!' },
  'bye-2': { text: 'Have an awesome day, Zef! See you tomorrow!', nameless: 'Have an awesome day, buddy! See you tomorrow!' },
  'bye-3': { text: "Don't forget to go potty before bed! See you in the morning!" },
  'bye-4': { text: 'See you tomorrow! Keep being awesome!' },
  'bye-5': { text: 'Bye for now! Give your grown-up a big hug from me!' },
  'bye-6': { text: 'Have a roar-some day! See you tomorrow!' },

  // ---------------------------------------------------------- taps
  'tap-1': { text: 'Hey there!' },
  'tap-2': { text: "You're awesome!" },
  'tap-3': { text: 'Ha ha! That tickles!' },
  'tap-4': { text: 'Rawr!' },
  'tap-5': { text: 'Boop! You got my nose!' },
  'tap-6': { text: 'Ha! Do it again!' },
  'tap-7': { text: "I'm a big, friendly dino!" },
  'tap-8': { text: 'High five! Oh wait, my arms are too short!' },
  'tap-9': { text: "Let's be best dino friends!" },
  'tap-10': { text: 'Rawr! Did I scare you? Just kidding!' },
};

export type LineId = keyof typeof LINES;

/** Which recording of a line fits this child: the usual one or a twin. */
function twin(l: Line, name: string, goal: number): string | null {
  if (l.nameless && !isZef(name)) return 'nameless';
  if (goal !== SPOKEN_GOAL && l.goals?.[goal]) return `goal${goal}`;
  if (l.anyGoal && goal !== SPOKEN_GOAL) return 'anygoal';
  return null;
}

/** The text actually spoken for a child called `name` with this goal. */
export function lineText(id: string, name: string, goal = SPOKEN_GOAL): string {
  const l = LINES[id];
  if (!l) return '';
  const t = twin(l, name, goal);
  if (t === 'nameless') return l.nameless!;
  if (t === 'anygoal') return l.anyGoal!;
  if (t?.startsWith('goal')) return l.goals![goal];
  return l.text;
}

export function isZef(name: string): boolean {
  return name.trim().toLowerCase() === 'zef';
}

/** Which audio clip to play: the usual one, or its name-free or number-free twin. */
export function clipId(id: string, name: string, goal = SPOKEN_GOAL): string {
  const l = LINES[id];
  const t = l ? twin(l, name, goal) : null;
  return t ? `${id}--${t}` : id;
}

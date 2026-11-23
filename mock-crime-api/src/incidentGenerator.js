const paraibaLocations = [
  {
    city: 'João Pessoa',
    neighborhoods: [
      { name: 'Manaíra', streets: ['Av. Edson Ramalho', 'Av. Gov. Flávio Ribeiro Coutinho', 'Rua Guarabira', 'Av. João Maurício'] },
      { name: 'Centro', streets: ['Av. Epitácio Pessoa', 'Parque Solon de Lucena', 'Rua Duque de Caxias', 'Av. Getúlio Vargas'] },
      { name: 'Mangabeira', streets: ['Av. Josefa Taveira', 'Rua Comerciante Alfredo Ferreira da Rocha', 'Av. Hilton Souto Maior'] },
      { name: 'Bancários', streets: ['Rua Empresário João Rodrigues Alves', 'Av. Sérgio Guerra', 'Rua Bancário Waldemar de Mesquita Accioly'] },
      { name: 'Bessa', streets: ['Av. Presidente Afonso Pena', 'Av. Argemiro de Figueiredo', 'Rua Bacharel José de Oliveira Curchatuz'] },
      { name: 'Tambaú', streets: ['Av. Almirante Tamandaré', 'Av. Nossa Senhora dos Navegantes', 'Av. Rui Carneiro'] },
      { name: 'Cristo Redentor', streets: ['Av. Ranieri Mazilli', 'Rua Horácio Trajano de Oliveira'] }
    ]
  },
  {
    city: 'Campina Grande',
    neighborhoods: [
      { name: 'Centro', streets: ['Rua Maciel Pinheiro', 'Av. Floriano Peixoto', 'Rua Venâncio Neiva'] },
      { name: 'Catolé', streets: ['Av. Severino Cruz', 'Rua Vigário Calixto', 'Rua Pedro II'] },
      { name: 'Liberdade', streets: ['Av. Almirante Barroso', 'Rua Odon Bezerra', 'Rua João Pessoa'] },
      { name: 'Bodocongó', streets: ['Av. Aprígio Veloso', 'Rua Felix Araújo', 'Rua João Suassuna'] }
    ]
  },
  {
    city: 'Santa Rita',
    neighborhoods: [
      { name: 'Centro', streets: ['Rua Juarez Távora', 'Rua Siqueira Campos', 'Av. Flávio Ribeiro Coutinho'] },
      { name: 'Tibiri', streets: ['Av. Conde', 'Rua Antônio Teotônio', 'Rua José Américo de Almeida'] },
      { name: 'Popular', streets: ['Rua João Pessoa', 'Rua da República', 'Rua São João'] }
    ]
  },
  {
    city: 'Patos',
    neighborhoods: [
      { name: 'Centro', streets: ['Rua Bossuet Wanderley', 'Rua Pedro Firmino', 'Av. Epitácio Pessoa'] },
      { name: 'Belo Horizonte', streets: ['Rua Horácio Nóbrega', 'Rua Peregrino Filho', 'Rua José Genuíno'] },
      { name: 'Liberdade', streets: ['Rua do Prado', 'Rua Severino Soares', 'Rua Frei Caneca'] }
    ]
  },
  {
    city: 'Bayeux',
    neighborhoods: [
      { name: 'Centro', streets: ['Av. Liberdade', 'Rua Flávio Maroja', 'Rua Petrônio Figueiredo'] },
      { name: 'Imaculada', streets: ['Rua São Sebastião', 'Rua Santa Rita', 'Rua do Comércio'] },
      { name: 'São Bento', streets: ['Rua Francisco Marques', 'Rua Estrela', 'Rua João XXIII'] }
    ]
  },
  {
    city: 'Cabedelo',
    neighborhoods: [
      { name: 'Centro', streets: ['Rua Duque de Caxias', 'Rua Presidente João Pessoa', 'Rua Pastor José Alves de Oliveira'] },
      { name: 'Intermares', streets: ['Av. Mar Vermelho', 'Av. Oceano Atlântico', 'Rua Golfo de Áden'] },
      { name: 'Poço', streets: ['Rua Golfo de Biscaia', 'Rua Golfo de Oman', 'Av. Oceano Índico'] }
    ]
  },
  {
    city: 'Sousa',
    neighborhoods: [
      { name: 'Centro', streets: ['Rua Coronel José Gomes de Sá', 'Rua Sinfrônio Nazaré', 'Rua Cônego José Viana'] },
      { name: 'Gato Preto', streets: ['Rua José Facundo de Lira', 'Rua Francisco Gadelha', 'Rua José de Paiva Gadelha'] },
      { name: 'Estação', streets: ['Rua Francisco Vieira da Costa', 'Rua João Pessoa', 'Rua José de Alencar'] }
    ]
  },
  {
    city: 'Cajazeiras',
    neighborhoods: [
      { name: 'Centro', streets: ['Rua Padre Rolim', 'Rua Tenente Sabino', 'Rua Coronel Juvêncio Carneiro'] },
      { name: 'Capoeiras', streets: ['Av. Joca Claudino', 'Rua Francisco Bezerra', 'Rua José Rodovalho de Alencar'] },
      { name: 'Cristo Rei', streets: ['Rua Vitória Bezerra', 'Rua Romualdo Rolim', 'Rua José Moreira de Figueiredo'] }
    ]
  },
  {
    city: 'Guarabira',
    neighborhoods: [
      { name: 'Centro', streets: ['Rua Getúlio Vargas', 'Rua Solon de Lucena', 'Rua Epitácio Pessoa'] },
      { name: 'Nordeste', streets: ['Rua Napoleão Laureano', 'Rua João Pimentel Filho', 'Rua Augusto de Almeida'] },
      { name: 'Novo', streets: ['Rua José Américo', 'Rua Joca Ataíde', 'Rua Otacílio Lira Cabral'] }
    ]
  },
  {
    city: 'Sapé',
    neighborhoods: [
      { name: 'Centro', streets: ['Rua Getúlio Vargas', 'Rua João Suassuna', 'Rua Padre Zeferino Maria'] },
      { name: 'Santa Marina', streets: ['Rua Antônio Mariz', 'Rua José da Cunha', 'Rua Manoel Gino'] },
      { name: 'Renato Ribeiro', streets: ['Rua José Pereira de Oliveira', 'Rua João Úrsulo', 'Rua Napoleão Laureano'] }
    ]
  },
  {
    city: 'Monteiro',
    neighborhoods: [
      { name: 'Centro', streets: ['Rua Sizenando Rafael', 'Rua Getúlio Vargas', 'Rua Cel. Francisco Torres'] },
      { name: 'Alto de São Vicente', streets: ['Rua Severino Bezerra', 'Rua João Minervino Dutra', 'Rua José de Souza'] },
      { name: 'Vila Popular', streets: ['Rua Manoel Alves de Sousa', 'Rua José Veríssimo', 'Rua Padre Aristides'] }
    ]
  },
  {
    city: 'Pombal',
    neighborhoods: [
      { name: 'Centro', streets: ['Rua João Capuxu', 'Rua Cel. José Fernandes', 'Rua Jerônimo Rosado'] },
      { name: 'Pereiros', streets: ['Rua Francisco de Assis', 'Rua João de Sousa', 'Rua Domingos de Medeiros'] },
      { name: 'Vida Nova', streets: ['Rua José Benício', 'Rua Nabor Wanderley', 'Rua Jairo Vieira Feitosa'] }
    ]
  },
  {
    city: 'Mamanguape',
    neighborhoods: [
      { name: 'Centro', streets: ['Rua Duque de Caxias', 'Rua Presidente Kennedy', 'Rua São José'] },
      { name: 'Areial', streets: ['Rua da Areia', 'Rua José Fernandes de Lima', 'Rua Otacílio Pessoa'] },
      { name: 'Campo', streets: ['Rua da Independência', 'Rua Antônio Clementino', 'Rua João XXIII'] }
    ]
  },
  {
    city: 'Itabaiana',
    neighborhoods: [
      { name: 'Centro', streets: ['Rua José Silveira', 'Rua Coronel Firmino Rodrigues', 'Rua Cônego Trancoso'] },
      { name: 'Jucuri', streets: ['Rua João Pessoa', 'Rua José Rufino', 'Rua Manoel Clementino'] },
      { name: 'Suburbana', streets: ['Rua São Pedro', 'Rua do Sol', 'Rua da Estação'] }
    ]
  },
  {
    city: 'Areia',
    neighborhoods: [
      { name: 'Centro', streets: ['Rua Epitácio Pessoa', 'Rua Professor Xavier Júnior', 'Rua Pedro Américo'] },
      { name: 'Jussara', streets: ['Rua Padre Chacon', 'Rua Manoel da Silva', 'Rua José de Freitas'] }
    ]
  }
];

const incidentTypes = ['Theft', 'Street Robbery', 'Vehicle Theft', 'Vandalism', 'Commercial Robbery'];
const hourlyActivityRates = [
  { hours: [22, 23, 0, 1, 2, 3], incidentsPerHour: 3 },
  { hours: [18, 19, 20, 21], incidentsPerHour: 2 },
  { hours: [4, 5, 6], incidentsPerHour: 1 },
  { hours: [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17], incidentsPerHour: 0.5 }
];
const targetDailyIncidentCount = 500;
const dailyActivityWeight = hourlyActivityRates.reduce(
  (total, period) => total + period.hours.length * period.incidentsPerHour,
  0
);

function chooseRandom(items, random) {
  return items[Math.floor(random() * items.length)];
}

function generateVictimCount(random = Math.random) {
  const value = random();
  if (value < 0.4) return 1;
  if (value < 0.7) return 2;
  if (value < 0.9) return 3;
  if (value < 0.97) return 4;
  return 5;
}

function generateOffenderCount(random = Math.random) {
  const value = random();
  if (value < 0.82) return 1;
  if (value < 0.95) return 2;
  if (value < 0.99) return 3;
  return 4;
}

function generateOccurrenceDate(now, random = Math.random) {
  const date = new Date(now);
  date.setUTCDate(date.getUTCDate() - Math.floor(random() * 30));

  const totalWeight = hourlyActivityRates.reduce(
    (total, period) => total + period.hours.length * period.incidentsPerHour,
    0
  );
  let selectedWeight = random() * totalWeight;
  let selectedPeriod = hourlyActivityRates[0];
  for (const period of hourlyActivityRates) {
    selectedWeight -= period.hours.length * period.incidentsPerHour;
    if (selectedWeight < 0) {
      selectedPeriod = period;
      break;
    }
  }

  date.setUTCHours(
    chooseRandom(selectedPeriod.hours, random) + 3,
    Math.floor(random() * 60),
    0,
    0
  );
  return date;
}

function generateRandomIncident({ occurrenceDate = null, now = new Date(), random = Math.random } = {}) {
  const city = chooseRandom(paraibaLocations, random);
  const location = chooseRandom(city.neighborhoods, random);
  const street = chooseRandom(location.streets, random);
  const addressNumber = Math.floor(random() * 1500) + 1;

  return {
    type: chooseRandom(incidentTypes, random),
    city: city.city,
    state: 'PB',
    neighborhood: location.name,
    street,
    address: `${street}, ${addressNumber}, ${location.name}, ${city.city} - PB`,
    victimCount: generateVictimCount(random),
    offenderCount: generateOffenderCount(random),
    occurredAt: occurrenceDate || generateOccurrenceDate(now, random),
    createdAt: new Date()
  };
}

function getIncidentsPerHour(hour) {
  const period = hourlyActivityRates.find(({ hours }) => hours.includes(hour));
  return period
    ? targetDailyIncidentCount / dailyActivityWeight * period.incidentsPerHour
    : 0;
}

function shouldGenerateIncidentNow(date = new Date(), random = Math.random) {
  const localHour = Number(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Fortaleza',
    hour: '2-digit',
    hourCycle: 'h23'
  }).format(date));

  return random() < getIncidentsPerHour(localHour) / 60;
}

module.exports = {
  generateOffenderCount,
  generateRandomIncident,
  generateVictimCount,
  getIncidentsPerHour,
  paraibaLocations,
  shouldGenerateIncidentNow
};

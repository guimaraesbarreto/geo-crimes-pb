const paraibaCityCoordinates = {
  'João Pessoa': [-34.855, -7.12],
  'Campina Grande': [-35.88, -7.23],
  'Santa Rita': [-34.98, -7.12],
  Patos: [-37.28, -7.02],
  Bayeux: [-34.93, -7.13],
  Cabedelo: [-34.84, -6.98],
  Sousa: [-38.23, -6.76],
  Cajazeiras: [-38.56, -6.89],
  Guarabira: [-35.49, -6.85],
  Sapé: [-35.23, -7.09],
  Monteiro: [-37.12, -7.89],
  Pombal: [-37.80, -6.77],
  Mamanguape: [-35.13, -6.84],
  Itabaiana: [-35.33, -7.33],
  Areia: [-35.69, -6.96]
};

const joaoPessoaStreetCoordinates = {
  'Av. Edson Ramalho': [-34.8286, -7.1065],
  'Av. Gov. Flávio Ribeiro Coutinho': [-34.8355, -7.1018],
  'Rua Guarabira': [-34.8315, -7.1045],
  'Av. João Maurício': [-34.8242, -7.1050],
  'Av. Epitácio Pessoa': [-34.8631, -7.1195],
  'Parque Solon de Lucena': [-34.8781, -7.1206],
  'Rua Duque de Caxias': [-34.8835, -7.1182],
  'Av. Getúlio Vargas': [-34.8812, -7.1225],
  'Av. Josefa Taveira': [-34.8398, -7.1712],
  'Rua Comerciante Alfredo Ferreira da Rocha': [-34.8435, -7.1685],
  'Av. Hilton Souto Maior': [-34.8310, -7.1650],
  'Rua Empresário João Rodrigues Alves': [-34.8421, -7.1465],
  'Av. Sérgio Guerra': [-34.8458, -7.1492],
  'Rua Bancário Waldemar de Mesquita Accioly': [-34.8485, -7.1510],
  'Av. Presidente Afonso Pena': [-34.8452, -7.0758],
  'Av. Argemiro de Figueiredo': [-34.8390, -7.0815],
  'Rua Bacharel José de Oliveira Curchatuz': [-34.8425, -7.0785],
  'Av. Almirante Tamandaré': [-34.8235, -7.1145],
  'Av. Nossa Senhora dos Navegantes': [-34.8255, -7.1130],
  'Av. Rui Carneiro': [-34.8325, -7.1120],
  'Av. Ranieri Mazilli': [-34.8765, -7.1585],
  'Rua Horácio Trajano de Oliveira': [-34.8720, -7.1550]
};

function deterministicHash(text) {
  let hash = 2166136261;
  for (const character of text) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function spreadCoordinate(text) {
  return ((deterministicHash(text) % 2001) / 1000 - 1) * 0.008;
}

function geocodeAddress(city, neighborhood, street, fullAddress) {
  const cityCenter = paraibaCityCoordinates[city];
  if (!cityCenter) {
    throw new Error(`No coordinates registered for Paraiba city: ${city}`);
  }

  const base = city === 'João Pessoa' && joaoPessoaStreetCoordinates[street]
    ? joaoPessoaStreetCoordinates[street]
    : [
        cityCenter[0] + spreadCoordinate(`${city}:${neighborhood}:lon`),
        cityCenter[1] + spreadCoordinate(`${city}:${neighborhood}:lat`)
      ];

  const numberMatch = fullAddress.match(/,\s*(\d+),/);
  const addressNumber = numberMatch ? Number(numberMatch[1]) : 0;
  if (!Number.isSafeInteger(addressNumber) || addressNumber < 0) {
    throw new Error(`Invalid address number: ${fullAddress}`);
  }

  const lon = base[0] + ((addressNumber % 500) - 250) * 0.000004;
  const lat = base[1] + Math.sin(addressNumber) * 0.0007;
  return { lon, lat };
}

module.exports = { geocodeAddress };

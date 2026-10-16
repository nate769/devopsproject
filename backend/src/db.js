const knex = require('knex');
const knexConfig = require('../knexfile');

function createDb() {
  return knex(knexConfig);
}

module.exports = { createDb, knexConfig };

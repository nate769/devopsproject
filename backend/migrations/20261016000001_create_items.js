// Creates the `items` table — the core inventory record.

exports.up = async function up(knex) {
  await knex.schema.createTable('items', (t) => {
    t.increments('id').primary();
    t.string('name', 120).notNullable();
    t.string('sku', 40).notNullable().unique();
    t.string('category', 60).notNullable().defaultTo('General');
    t.integer('quantity').notNullable().defaultTo(0);
    // Money is stored as integer cents to avoid floating-point rounding errors.
    t.integer('unit_price_cents').notNullable().defaultTo(0);
    t.integer('reorder_level').notNullable().defaultTo(5);
    t.string('location', 60).nullable();
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('items');
};

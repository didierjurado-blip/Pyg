/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function up(knex) {
  await knex.schema.createTable('security_audit', (table) => {
    table.uuid('id').primary();
    table.timestamp('occurred_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.string('event_type', 120).notNullable().index();
    table.string('actor_user_id', 80).nullable().index();
    table.string('actor_email', 200).nullable();
    table.string('ip_address', 120).nullable();
    table.jsonb('metadata').notNullable().defaultTo('{}');
  });
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('security_audit');
};

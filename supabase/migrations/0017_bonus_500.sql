-- Office Bets — one-time 500-token bonus for everyone

update users set token_balance = token_balance + 500;

insert into transactions (user_id, type, amount)
  select id, 'adjustment', 500 from users;

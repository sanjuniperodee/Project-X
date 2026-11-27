-- Database-per-service: each service owns its schema and is the only one that touches it.
CREATE DATABASE px_projects;
CREATE DATABASE px_payments;
CREATE DATABASE px_sales;

-- Used by integration tests (`make test`).
CREATE DATABASE px_projects_test;
CREATE DATABASE px_payments_test;
CREATE DATABASE px_sales_test;

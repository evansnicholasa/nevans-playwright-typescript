Feature: Order persistence
  Scenario: API create is queryable in Postgres
    When I create an order through the API
    Then Postgres has a matching row

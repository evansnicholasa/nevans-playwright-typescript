Feature: Orders API
  Scenario: Create and fetch an order
    When I create an order through the API
    Then the API returns 201 with customer and item
    And I can fetch that order by id

  Scenario: Missing fields are rejected
    When I create an order through the API with no customer
    Then the API returns 400

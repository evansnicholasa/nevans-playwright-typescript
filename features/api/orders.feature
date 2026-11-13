Feature: Orders API
  @ORD-1-C02 @ORD-1-C04
  Scenario: Create and fetch an order
    When I create an order through the API
    Then the API returns 201 with customer and item
    And the response matches the order contract
    And I can fetch that order by id

  @ORD-1-C03
  Scenario: Missing fields are rejected
    When I create an order through the API with no customer
    Then the API returns 400
    And the error response matches the error contract

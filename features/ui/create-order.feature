Feature: Create an order in the UI
  As a customer
  I want to place an order from the web page
  So that it is stored and visible on the list

  Scenario: A customer can place an order
    Given I open the orders page
    When I submit an order for a unique customer
    Then the order appears in the list
    And the order is stored in the database

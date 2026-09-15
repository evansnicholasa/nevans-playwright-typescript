Feature: Order form validation
  Scenario: Empty form shows an error
    Given I open the orders page
    When I submit the order form empty
    Then I see the validation error "Customer and item are required"

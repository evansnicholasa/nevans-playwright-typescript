Feature: Order created event
  Scenario: Creating an order publishes order.created
    Given I am subscribed to order events
    When I create an order through the API
    Then I receive an order.created message for that order

  Scenario: Waiting for a missing event fails fast
    Given I am subscribed to order events
    When I wait for a message for order id 0
    Then the wait times out

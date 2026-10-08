#!/usr/bin/env bash
# One-time setup of email alerts for the Pi poller (see README.md, "Alerts"). Run from the laptop
# with admin credentials. Safe to re-run; if you do so during a game window, restart the poller so
# it re-arms the game-time alarm.
set -euo pipefail

email=${1:?usage: bash pi/setup_alerts.sh you@example.com}
region=us-east-1
namespace=MinutesMap/PiPoller
pi_user=minutesmap-nba-relay

account=$(aws sts get-caller-identity --query Account --output text)
topic=$(aws sns create-topic --region "$region" --name minutesmap-pi-alerts --query TopicArn --output text)
existing=$(aws sns list-subscriptions-by-topic --region "$region" --topic-arn "$topic" \
  --query "Subscriptions[?Endpoint=='$email'].SubscriptionArn" --output text)
if [ -z "$existing" ]; then
  aws sns subscribe --region "$region" --topic-arn "$topic" --protocol email --notification-endpoint "$email" >/dev/null
  echo "Subscribed $email: click the link in the confirmation email from AWS."
fi

alarm() {
  aws cloudwatch put-metric-alarm --region "$region" --namespace "$namespace" \
    --alarm-actions "$topic" --ok-actions "$topic" "$@"
}
alarm --alarm-name MinutesMap-Pi-Down \
  --alarm-description "No heartbeat from the Pi poller for an hour. Check: ssh raspberrypi systemctl --user status minutesmap-poller" \
  --metric-name Heartbeat --statistic SampleCount --period 300 \
  --evaluation-periods 12 --datapoints-to-alarm 12 --threshold 1 \
  --comparison-operator LessThanThreshold --treat-missing-data breaching
# The runner arms this one only around games.
alarm --alarm-name MinutesMap-Pi-Down-GameTime --no-actions-enabled \
  --alarm-description "No heartbeat from the Pi poller for 3 minutes during a game window. Check: ssh raspberrypi systemctl --user status minutesmap-poller" \
  --metric-name Heartbeat --statistic SampleCount --period 60 \
  --evaluation-periods 3 --datapoints-to-alarm 3 --threshold 1 \
  --comparison-operator LessThanThreshold --treat-missing-data breaching
alarm --alarm-name MinutesMap-NBA-Feed-Blocked \
  --alarm-description "The NBA CDN refused the Pi's scoreboard checks 3 times in a row: the Pi may be blocked." \
  --metric-name NbaFeedRefused --statistic Maximum --period 60 \
  --evaluation-periods 1 --threshold 3 \
  --comparison-operator GreaterThanOrEqualToThreshold --treat-missing-data notBreaching

aws iam put-user-policy --user-name "$pi_user" --policy-name minutesmap-poller-alerts --policy-document "$(cat <<JSON
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "cloudwatch:PutMetricData",
      "Resource": "*",
      "Condition": {"StringEquals": {"cloudwatch:namespace": "$namespace"}}
    },
    {
      "Effect": "Allow",
      "Action": ["cloudwatch:EnableAlarmActions", "cloudwatch:DisableAlarmActions"],
      "Resource": "arn:aws:cloudwatch:$region:$account:alarm:MinutesMap-Pi-Down-GameTime"
    }
  ]
}
JSON
)"
echo "Alarms and the Pi's alert policy are in place."

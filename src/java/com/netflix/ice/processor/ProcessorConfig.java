/*
 *
 *  Copyright 2013 Netflix, Inc.
 *
 *     Licensed under the Apache License, Version 2.0 (the "License");
 *     you may not use this file except in compliance with the License.
 *     You may obtain a copy of the License at
 *
 *         http://www.apache.org/licenses/LICENSE-2.0
 *
 *     Unless required by applicable law or agreed to in writing, software
 *     distributed under the License is distributed on an "AS IS" BASIS,
 *     WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *     See the License for the specific language governing permissions and
 *     limitations under the License.
 *
 */
package com.netflix.ice.processor;

import com.amazonaws.auth.AWSCredentialsProvider;
import com.netflix.ice.common.*;

import org.joda.time.DateTime;
import org.joda.time.DateTimeZone;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.Properties;

public class ProcessorConfig extends Config {
    private static final Logger logger = LoggerFactory.getLogger(ProcessorConfig.class);
    private static ProcessorConfig instance;
    private static ReservationCapacityPoller reservationCapacityPoller;
    private static BillingFileProcessor billingFileProcessor;

    public final String[] billingAccountIds;
    public final String[] billingS3BucketNames;
    public final String[] billingS3BucketPrefixes;
    public final String[] billingAccessRoleNames;
    public final String[] billingAccessExternalIds;
    public final DateTime costAndUsageStartDate;

    public final String[] customTags;
    public final ReservationService reservationService;
    public final LineItemProcessor lineItemProcessor;
    public final Randomizer randomizer;
    public final double costPerMonitorMetricPerHour;
    public final boolean useBlended;
    public final boolean processOnce;
    public final String processorRegion;
    public final String processorInstanceId;

    public final String useCostForResourceGroup;

    /**
     *
     * @param properties (required)
     * @param accountService (required)
     * @param productService (required)
     * @param reservationService (required)
     * @param resourceService (optional)
     * @param lineItemProcessor (required)
     * @param randomizer (optional)
     */
    public ProcessorConfig(
            Properties properties,
            AWSCredentialsProvider credentialsProvider,
            AccountService accountService,
            ProductService productService,
            ReservationService reservationService,
            ResourceService resourceService,
            LineItemProcessor lineItemProcessor,
            Randomizer randomizer) {

        super(properties, credentialsProvider, accountService, productService, resourceService);

        if (reservationService == null) throw new IllegalArgumentException("reservationService must be specified");
        if (lineItemProcessor == null) throw new IllegalArgumentException("lineItemProcessor must be specified");

        this.reservationService = reservationService;
        this.lineItemProcessor = lineItemProcessor;
        this.randomizer = randomizer;

        if (properties.getProperty(IceOptions.COST_PER_MONITORMETRIC_PER_HOUR) != null)
            this.costPerMonitorMetricPerHour = Double.parseDouble(properties.getProperty(IceOptions.COST_PER_MONITORMETRIC_PER_HOUR));
        else
            this.costPerMonitorMetricPerHour = 0;

        billingS3BucketNames = properties.getProperty(IceOptions.BILLING_S3_BUCKET_NAME).split(",");
        billingS3BucketPrefixes = properties.getProperty(IceOptions.BILLING_S3_BUCKET_PREFIX, "").split(",");
        billingAccountIds = properties.getProperty(IceOptions.BILLING_PAYER_ACCOUNT_ID, "").split(",");
        billingAccessRoleNames = properties.getProperty(IceOptions.BILLING_ACCESS_ROLENAME, "").split(",");
        billingAccessExternalIds = properties.getProperty(IceOptions.BILLING_ACCESS_EXTERNALID, "").split(",");
        
        String[] yearMonth = properties.getProperty(IceOptions.COST_AND_USAGE_START_DATE, "").split("-");
        if (yearMonth.length < 2)
            costAndUsageStartDate = new DateTime(3000, 1, 1, 0, 0, DateTimeZone.UTC); // Arbitrary year in the future
        else
        	costAndUsageStartDate = new DateTime(Integer.parseInt(yearMonth[0]), Integer.parseInt(yearMonth[1]), 1, 0, 0, DateTimeZone.UTC);

        // Tags initialization
        customTags = properties.getProperty(IceOptions.CUSTOM_TAGS, "").split(",");        
        useBlended = properties.getProperty(IceOptions.USE_BLENDED) == null ? false : Boolean.parseBoolean(properties.getProperty(IceOptions.USE_BLENDED));

        useCostForResourceGroup = properties.getProperty(IceOptions.RESOURCE_GROUP_COST, "modeled");
        
        processOnce = properties.getProperty(IceOptions.PROCESS_ONCE) == null ? false : Boolean.parseBoolean(properties.getProperty(IceOptions.PROCESS_ONCE));
        processorRegion = properties.getProperty(IceOptions.PROCESSOR_REGION);
        processorInstanceId = properties.getProperty(IceOptions.PROCESSOR_INSTANCE_ID);

        ProcessorConfig.instance = this;

        lineItemProcessor.init(useCostForResourceGroup.equals("modeled"), costPerMonitorMetricPerHour);
        reservationService.init();
        if (resourceService != null)
            resourceService.init(customTags);

        billingFileProcessor = new BillingFileProcessor(this,
            properties.getProperty(IceOptions.URL_PREFIX),
            properties.getProperty(IceOptions.ONDEMAND_COST_ALERT_THRESHOLD) == null ? null :  Double.parseDouble(properties.getProperty(IceOptions.ONDEMAND_COST_ALERT_THRESHOLD)),
            properties.getProperty(IceOptions.FROM_EMAIL),
            properties.getProperty(IceOptions.ONDEMAND_COST_ALERT_EMAILS));
    }

    public void start (ReservationCapacityPoller reservationCapacityPoller) {
        logger.info("starting up...");

        ProcessorConfig.reservationCapacityPoller = reservationCapacityPoller;
        if (reservationCapacityPoller != null)
            reservationCapacityPoller.start();

        while (reservationCapacityPoller != null && !reservationCapacityPoller.updatedConfig()) {
            try {
                Thread.sleep(10000L);
            }
            catch (InterruptedException e) {
            }
        }

        billingFileProcessor.start();
    }

    public void shutdown() {
        logger.info("Shutting down...");

        billingFileProcessor.shutdown();
        reservationCapacityPoller.shutdown();
    }

    /**
     *
     * @return singlton instance
     */
    public static ProcessorConfig getInstance() {
        return instance;
    }
}

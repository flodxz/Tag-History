import React from 'react';
import styles from '../../styles/timeline.module.css';
import TimelineGrid from './TimelineGrid';

interface TimelineContainerProps {
  selectedCategories: string[];
  isDraggingEnabled: boolean;
  timelineOrder: 'ascending' | 'descending';
}

const TimelineContainer: React.FC<TimelineContainerProps> = ({ 
  selectedCategories, 
  isDraggingEnabled
}) => {
  return (
    <div className={styles.container}>
      <TimelineGrid 
        visibleCategories={selectedCategories} 
        isDraggingEnabled={isDraggingEnabled}
      />
    </div>
  );
};

export default TimelineContainer;
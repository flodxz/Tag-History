import React, { useState, useEffect, useRef } from 'react';
import styles from '../../styles/events.module.css';
import { TimelineEvent } from '../../data/events';
import EventModal from './EventModal';
import { getEventStyles } from '../../config/categories';

interface EventBoxProps {
  event: TimelineEvent;
  position: number;
  column: number;
  timelinePosition: number;
  isDraggingEnabled: boolean;
  onUpdateColumn: (eventId: string, newColumn: number, position: number) => void;
}

const EventBox: React.FC<EventBoxProps> = ({ 
  event, 
  position, 
  column, 
  timelinePosition,
  isDraggingEnabled,
  onUpdateColumn 
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [startY, setStartY] = useState(0);
  const [currentX, setCurrentX] = useState(0);
  const [currentY, setCurrentY] = useState(0);
  const [eventBoxHeight, setEventBoxHeight] = useState(0);
  const eventBoxRef = useRef<HTMLDivElement>(null);
  const eventStyles = getEventStyles(event.category);
  
  useEffect(() => {
    if (eventBoxRef.current) {
      setEventBoxHeight(eventBoxRef.current.offsetHeight);
    }
  }, []);

  const baseOffset = 210;
  const columnWidth = 220;
  const leftPosition = baseOffset + (column * columnWidth);
  
  const connectionLineWidth = leftPosition - 100;
  const cardPosition = position - (eventBoxHeight / 2);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (eventBoxRef.current && isDraggingEnabled) {
      const rect = eventBoxRef.current.getBoundingClientRect();
      setStartX(e.clientX - rect.left);
      setStartY(e.clientY - rect.top);
      setIsDragging(true);
      setCurrentX(rect.left);
      setCurrentY(rect.top);
    }
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (isDragging) {
      const newX = e.clientX - startX;
      const newY = e.clientY - startY;
      setCurrentX(newX);
      setCurrentY(newY);
      
      if (eventBoxRef.current) {
        const deltaX = e.clientX - startX - leftPosition;
        const connectorElement = eventBoxRef.current.previousElementSibling as HTMLElement;
        
        eventBoxRef.current.style.transform = `translateX(${deltaX}px)`;
        if (connectorElement) {
          const newWidth = leftPosition + deltaX - 100;
          connectorElement.style.width = `${newWidth}px`;
        }
      }
    }
  };

  const handleMouseUp = (e: MouseEvent) => {
    if (isDragging) {
      setIsDragging(false);
      const finalX = e.clientX - startX;
      
      // Calculate new column based on final position
      const relativeX = finalX - baseOffset;
      const newColumn = Math.round(relativeX / columnWidth);
      const boundedColumn = Math.max(0, Math.min(newColumn, 19)); // Assuming 20 columns (0-19)
      
      if (boundedColumn !== column) {
        onUpdateColumn(event.id, boundedColumn, position);
      }

      if (eventBoxRef.current) {
        eventBoxRef.current.style.transform = 'none';
        const connectorElement = eventBoxRef.current.previousElementSibling as HTMLElement;
        if (connectorElement) {
          connectorElement.style.width = `${connectionLineWidth}px`;
        }
      }
    }
  };

  const handleClick = () => {
    if (!isDraggingEnabled && !isDragging) {
      setIsModalOpen(true);
    }
  };

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging]);

  return (
    <>
      <div
        className={styles.connectionLine}
        style={{
          width: `${connectionLineWidth}px`,
          top: `${position}px`
        }}
      />
      <div 
        ref={eventBoxRef}
        className={`${styles.eventBox} ${isDragging ? styles.dragging : ''}`}
        style={{ 
          top: `${cardPosition}px`,
          left: `${leftPosition}px`,
          cursor: isDraggingEnabled ? (isDragging ? 'grabbing' : 'grab') : 'pointer',
          ...eventStyles
        }}
        onMouseDown={handleMouseDown}
        onClick={handleClick}
        data-event-id={event.id}
      >
        <div className={styles.eventContent}>
          <h3 className={styles.eventTitle}>{event.title}</h3>
          <div className={styles.eventDate}>
            {new Date(event.date).toLocaleDateString()}
          </div>
        </div>
      </div>
      
      {isModalOpen && (
        <EventModal 
          event={event} 
          onClose={() => setIsModalOpen(false)} 
        />
      )}
    </>
  );
};

export default EventBox;